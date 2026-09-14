'use client'

import { useEffect, useMemo, useState } from 'react'
import { claimRejectionReasons } from '../domain'
import {
  adminClaimApi,
  directConversionResultSchema,
  mutationResultSchema,
  queueResultSchema,
  reviewDetailSchema,
  statusReceiptResultSchema,
  versionedMutationResultSchema,
  type ProcessedItem,
  type QueueItem,
  type RejectionReason,
  type ReviewDetail,
} from './schemas'
import styles from './member-claim-admin.module.css'

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(
      status === 409
        ? '记录已变化，请刷新后重试。'
        : status === 403
          ? '你没有执行此操作的权限。'
          : '服务暂时不可用。',
    )
  }
}
async function json(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.error?.requestId ?? body?.requestId,
    )
  return body
}
const labels = { member: '会员', staff: '干事', cadre: '干部' } as const
export function reviewSuccessMessage(
  kind: 'claim' | 'intake',
  action: 'approve' | 'reject',
) {
  if (action === 'approve') {
    return kind === 'claim'
      ? '账号认领已批准，账号已直接生效；用户可用其自行设置的正式密码登录。'
      : '人工核验已批准并完成 Member 处理；本操作没有隐式创建 AuthUser。需要账号时请另行预配置或直接建号。'
  }
  return kind === 'claim'
    ? '账号认领已拒绝，敏感核验资料已按保留规则清除；必要时可从队列重新开放认领。'
    : '人工核验申请已拒绝，敏感核验资料已按保留规则清除；如仍需核验，请让申请人重新提交人工核验申请。'
}
function age(value: string) {
  const hours = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 3_600_000),
  )
  return hours < 24
    ? `${hours} 小时`
    : `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`
}

function queuePath(filter: 'all' | 'followUp', cursor?: string | null) {
  const query = new URLSearchParams({ processedFilter: filter })
  if (cursor) query.set('processedCursor', cursor)
  return `${adminClaimApi.queue}?${query.toString()}`
}

export function MemberClaimAdminClient() {
  const [items, setItems] = useState<QueueItem[]>([]),
    [processed, setProcessed] = useState<ProcessedItem[]>([]),
    [selected, setSelected] = useState<ReviewDetail | null>(null)
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(''),
    [reason, setReason] = useState<RejectionReason>('insufficientEvidence')
  const [confirmStale, setConfirmStale] = useState(false),
    [adoptProfile, setAdoptProfile] = useState(false),
    [memberId, setMemberId] = useState('')
  const [publicMessage, setPublicMessage] = useState('')
  const [statusReceipt, setStatusReceipt] = useState<{
    expiresAt: string
    value: string
  } | null>(null)
  const [credentialCopyStatus, setCredentialCopyStatus] = useState('')
  const [receiptCopyStatus, setReceiptCopyStatus] = useState('')
  const [confirmCredentialEffect, setConfirmCredentialEffect] = useState(false)
  const [processedFilter, setProcessedFilter] = useState<'all' | 'followUp'>(
    'all',
  )
  const [processedNextCursor, setProcessedNextCursor] = useState<string | null>(
    null,
  )
  const [credential, setCredential] = useState<{
    temporaryCredential: string
    temporaryCredentialExpiresAt: string
  } | null>(null)
  const staleDiff = useMemo(
    () =>
      selected?.stale &&
      JSON.stringify(selected.authorization) !==
        JSON.stringify(selected.authorizationAtSubmission),
    [selected],
  )
  async function loadQueue(options?: {
    append?: boolean
    cursor?: string | null
    filter?: 'all' | 'followUp'
  }) {
    const filter = options?.filter ?? processedFilter
    try {
      const queue = queueResultSchema.parse(
        await json(queuePath(filter, options?.cursor)),
      )
      setItems(queue.items)
      setProcessed((current) =>
        options?.append ? [...current, ...queue.processed] : queue.processed,
      )
      setProcessedFilter(filter)
      setProcessedNextCursor(queue.processedNextCursor)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '队列加载失败。')
    }
  }
  useEffect(() => {
    let active = true
    void json(queuePath('all'))
      .then((value) => queueResultSchema.parse(value))
      .then((queue) => {
        if (active) {
          setItems(queue.items)
          setProcessed(queue.processed)
          setProcessedNextCursor(queue.processedNextCursor)
        }
      })
      .catch((error: unknown) => {
        if (active)
          setFeedback(error instanceof Error ? error.message : '队列加载失败。')
      })
    return () => {
      active = false
    }
  }, [])
  async function open(item: QueueItem) {
    setFeedback('')
    setCredentialCopyStatus('')
    setReceiptCopyStatus('')
    setCredential(null)
    setStatusReceipt(null)
    setConfirmStale(false)
    setConfirmCredentialEffect(false)
    setAdoptProfile(false)
    setMemberId('')
    const detail = reviewDetailSchema.parse(
      await json(
        item.kind === 'claim'
          ? adminClaimApi.claimDetail(item.id)
          : adminClaimApi.intakeDetail(item.id),
      ),
    )
    setPublicMessage(detail.publicMessage ?? '')
    setSelected(detail)
  }
  async function copyOnce(
    value: string,
    label: string,
    setStatus: (value: string) => void,
  ) {
    try {
      await navigator.clipboard.writeText(value)
      setStatus(`${label}已复制。`)
    } catch {
      setStatus(`${label}复制失败，请手动选择并复制。`)
    }
  }
  async function mutate(
    path: string,
    body: object,
    successMessage: string,
    conversion: boolean | 'raw' = false,
  ) {
    setBusy(true)
    setFeedback('')
    try {
      const result = await json(path, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (conversion === true) {
        setCredential(directConversionResultSchema.parse(result))
        setCredentialCopyStatus('')
      } else if (conversion !== 'raw') mutationResultSchema.parse(result)
      setSelected(null)
      setFeedback(successMessage)
      await loadQueue()
    } catch (error) {
      setFeedback(
        error instanceof ApiError
          ? `${error.message}${error.requestId ? ` 请求 ID：${error.requestId}` : ''}`
          : '响应格式不符合约定。',
      )
    } finally {
      setBusy(false)
    }
  }
  function review(action: 'approve' | 'reject') {
    if (!selected) return
    const path =
      selected.kind === 'claim'
        ? action === 'approve'
          ? adminClaimApi.approveClaim(selected.id)
          : adminClaimApi.rejectClaim(selected.id)
        : action === 'approve'
          ? adminClaimApi.approveIntake(selected.id)
          : adminClaimApi.rejectIntake(selected.id)
    const body =
      selected.kind === 'claim'
        ? {
            expectedClaimVersion: selected.recordVersion,
            expectedAccountVersion: selected.accountRecordVersion,
            ...(action === 'approve'
              ? { confirmCurrentAuthorization: confirmStale }
              : { reason }),
          }
        : {
            expectedVersion: selected.recordVersion,
            ...(action === 'approve'
              ? {
                  adoptApplicationProfile: adoptProfile,
                  member: memberId
                    ? { mode: 'existing', memberId }
                    : { mode: 'create' },
                }
              : { reason }),
          }
    void mutate(path, body, reviewSuccessMessage(selected.kind, action))
  }
  return (
    <main className={styles.page}>
      <header>
        <p className={styles.eyebrow}>会员账号核验</p>
        <h1>认领与人工核验队列</h1>
        <p>申请身份不是授权；批准始终采用当前服务端账号配置。</p>
      </header>
      <aside className={styles.guidance} aria-labelledby="claim-flow-title">
        <h2 id="claim-flow-title">四种处理结果</h2>
        <p>
          预配置不会签发临时凭证；快速认领由用户自行设置正式密码，批准后账号直接
          active；人工 Intake 批准不会隐式创建
          AuthUser；只有“转换为直接激活”才会签发一次性、72 小时有效的临时凭证。
        </p>
      </aside>
      <div aria-live="polite" className={styles.feedback}>
        {feedback}
      </div>
      {credential ? (
        <section
          className={styles.credential}
          aria-labelledby="credential-title"
        >
          <h2 id="credential-title">一次性临时凭证</h2>
          <p>
            仅现在展示，请立即通过既有线下渠道交付，并请用户在登录页激活区于 72
            小时内设置正式密码。
          </p>
          <code>{credential.temporaryCredential}</code>
          <button
            onClick={() =>
              void copyOnce(
                credential.temporaryCredential,
                '临时凭证',
                setCredentialCopyStatus,
              )
            }
            type="button"
          >
            复制临时凭证
          </button>
          <p>过期时间：{credential.temporaryCredentialExpiresAt}</p>
          <p aria-live="polite">{credentialCopyStatus}</p>
        </section>
      ) : null}
      <div className={styles.layout}>
        <section className={styles.panel} aria-labelledby="queue-title">
          <h2 id="queue-title">待处理项目</h2>
          {items.length ? (
            <ul className={styles.queue}>
              {items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button type="button" onClick={() => void open(item)}>
                    <strong>
                      {item.kind === 'claim' ? '账号认领' : '人工核验'}
                    </strong>
                    <span>
                      {labels[item.applicantIdentity]} · 积压{' '}
                      {age(item.submittedAt)}
                      {item.canReopen ? ' · 可重新开放认领' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>当前没有待处理项目。</p>
          )}
        </section>
        <section className={styles.panel} aria-labelledby="processed-title">
          <h2 id="processed-title">已处理与后续操作</h2>
          <div className={styles.actions} aria-label="已处理记录筛选">
            <button
              type="button"
              aria-pressed={processedFilter === 'all'}
              onClick={() => void loadQueue({ filter: 'all' })}
            >
              全部已处理
            </button>
            <button
              type="button"
              aria-pressed={processedFilter === 'followUp'}
              onClick={() => void loadQueue({ filter: 'followUp' })}
            >
              需要后续操作
            </button>
          </div>
          {processed.length ? (
            <>
              <ul className={styles.queue}>
                {processed.map((item) => (
                  <li key={`processed-${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() =>
                        void open({
                          accountId: item.accountId,
                          applicantIdentity: 'member',
                          associationIdentity: null,
                          canReopen: item.actions.canReopen,
                          id: item.id,
                          kind: item.kind,
                          recordVersion: item.recordVersion,
                          status: 'rejected',
                          submittedAt: item.processedAt,
                        })
                      }
                    >
                      <strong>{item.productStatus}</strong>
                      <span>
                        {item.kind === 'claim' ? '账号认领' : '人工核验'} ·{' '}
                        {item.processedAt}
                      </span>
                      <span>处理人：{item.processedBy}</span>
                      <span>
                        公开留言：{item.publicMessageSummary ?? '未设置'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {processedNextCursor ? (
                <nav className={styles.actions} aria-label="已处理记录分页">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void loadQueue({
                        append: true,
                        cursor: processedNextCursor,
                      })
                    }
                  >
                    加载下一页
                  </button>
                </nav>
              ) : null}
            </>
          ) : (
            <p>
              {processedFilter === 'followUp'
                ? '当前没有需要后续操作的记录。'
                : '当前没有已处理记录。'}
            </p>
          )}
        </section>
        <section className={styles.panel} aria-labelledby="detail-title">
          <h2 id="detail-title">审核详情</h2>
          {!selected ? (
            <p>从队列选择一项。</p>
          ) : (
            <>
              <dl className={styles.facts}>
                <div>
                  <dt>姓名</dt>
                  <dd>{selected.name}</dd>
                </div>
                <div>
                  <dt>协会身份</dt>
                  <dd>
                    {selected.associationIdentity
                      ? labels[selected.associationIdentity]
                      : '尚未建立'}
                  </dd>
                </div>
                <div>
                  <dt>申请身份</dt>
                  <dd>{labels[selected.applicantIdentity]}</dd>
                </div>
                <div>
                  <dt>提交时间 / 积压</dt>
                  <dd>
                    {selected.submittedAt} / {age(selected.submittedAt)}
                  </dd>
                </div>
                <div>
                  <dt>学号</dt>
                  <dd>{selected.studentNumber ?? '未提供'}</dd>
                </div>
                <div>
                  <dt>专业</dt>
                  <dd>{selected.major ?? '未提供'}</dd>
                </div>
              </dl>
              <section aria-labelledby="verification-contacts-title">
                <h3 id="verification-contacts-title">核验联系方式</h3>
                {selected.contacts.length ? (
                  <ul>
                    {selected.contacts.map((contact, index) => (
                      <li key={`${contact.type}-${index}`}>
                        {contact.label ?? contact.type}：{contact.value}
                        {contact.isPrimary ? '（主要联系方式）' : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>终态记录已按保留规则清除联系方式。</p>
                )}
              </section>
              {selected.authorization ? (
                <div className={styles.authGrid}>
                  <section>
                    <h3>目标角色</h3>
                    <p>{selected.authorization.role}</p>
                    <h3>角色默认权限摘要</h3>
                    {selected.authorization.defaultPermissions.length ? (
                      <ul>
                        {selected.authorization.defaultPermissions.map(
                          (value) => (
                            <li key={value}>{value}</li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p>无默认业务权限</p>
                    )}
                  </section>
                  <section>
                    <h3>个人权限差异</h3>
                    {selected.authorization.overrides.length ? (
                      <ul>
                        {selected.authorization.overrides.map(
                          (value, index) => (
                            <li key={`${value.permission}-${index}`}>
                              {value.effect} · {value.permission} ·{' '}
                              {value.scopeLabel}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p>无个人差异</p>
                    )}
                  </section>
                </div>
              ) : null}
              {staleDiff ? (
                <label className={styles.warning}>
                  <input
                    type="checkbox"
                    checked={confirmStale}
                    onChange={(event) => setConfirmStale(event.target.checked)}
                  />
                  授权配置已变化；我已核对并确认采用当前服务端配置。
                </label>
              ) : null}
              {selected.kind === 'intake' ? (
                <fieldset>
                  <legend>批准后的 Member 处理</legend>
                  <label>
                    既有 Member ID（留空则新建）
                    <input
                      value={memberId}
                      onChange={(event) => setMemberId(event.target.value)}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={adoptProfile}
                      onChange={(event) =>
                        setAdoptProfile(event.target.checked)
                      }
                    />
                    关联既有 Member 时采用本次申请资料
                  </label>
                </fieldset>
              ) : null}
              <label>
                拒绝 / reopen 原因
                <select
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value as RejectionReason)
                  }
                >
                  {claimRejectionReasons.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                申请人可见留言（不写内部原因）
                <textarea
                  maxLength={300}
                  onChange={(event) => setPublicMessage(event.target.value)}
                  rows={4}
                  value={publicMessage}
                />
              </label>
              {selected.actions.canUpdatePublicMessage ||
              selected.actions.canReissueStatusReceipt ? (
                <div className={styles.actions}>
                  {selected.actions.canUpdatePublicMessage ? (
                    <button
                      disabled={busy || !publicMessage.trim()}
                      onClick={() =>
                        void (async () => {
                          setBusy(true)
                          try {
                            const result = versionedMutationResultSchema.parse(
                              await json(
                                selected.kind === 'claim'
                                  ? adminClaimApi.claimPublicMessage(
                                      selected.id,
                                    )
                                  : adminClaimApi.intakePublicMessage(
                                      selected.id,
                                    ),
                                {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    expectedVersion: selected.recordVersion,
                                    publicMessage: publicMessage.trim(),
                                    reason: '管理员更新申请人可见留言',
                                  }),
                                },
                              ),
                            )
                            setSelected({
                              ...selected,
                              publicMessage: publicMessage.trim(),
                              recordVersion: result.recordVersion,
                            })
                            setFeedback('公开留言已更新。')
                            await loadQueue()
                          } catch (error) {
                            setFeedback(
                              error instanceof Error
                                ? error.message
                                : '更新失败。',
                            )
                          } finally {
                            setBusy(false)
                          }
                        })()
                      }
                      type="button"
                    >
                      更新申请人可见留言
                    </button>
                  ) : null}
                  {selected.actions.canReissueStatusReceipt ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          setBusy(true)
                          try {
                            const result = statusReceiptResultSchema.parse(
                              await json(
                                selected.kind === 'claim'
                                  ? adminClaimApi.claimStatusReceipt(
                                      selected.id,
                                    )
                                  : adminClaimApi.intakeStatusReceipt(
                                      selected.id,
                                    ),
                                {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    expectedVersion: selected.recordVersion,
                                    reason: '管理员重新签发查询凭证',
                                  }),
                                },
                              ),
                            )
                            setStatusReceipt({
                              expiresAt: result.statusReceiptExpiresAt,
                              value: result.statusReceipt,
                            })
                            setReceiptCopyStatus('')
                            setSelected({
                              ...selected,
                              recordVersion: result.recordVersion,
                            })
                            setFeedback(
                              '新的查询凭证仅在当前页面显示一次；旧凭证已失效。',
                            )
                            await loadQueue()
                          } catch (error) {
                            setFeedback(
                              error instanceof Error
                                ? error.message
                                : '补发失败。',
                            )
                          } finally {
                            setBusy(false)
                          }
                        })()
                      }
                      type="button"
                    >
                      重新签发查询凭证
                    </button>
                  ) : null}
                </div>
              ) : null}
              {statusReceipt ? (
                <section
                  className={styles.credential}
                  aria-label="一次性查询凭证"
                >
                  <p>
                    用途：仅用于公开认领进度查询，不能登录、激活账号或取得任何权限。
                  </p>
                  <p>仅现在显示，请通过既有安全线下渠道交付。</p>
                  <code>{statusReceipt.value}</code>
                  <button
                    onClick={() =>
                      void copyOnce(
                        statusReceipt.value,
                        '查询凭证',
                        setReceiptCopyStatus,
                      )
                    }
                    type="button"
                  >
                    复制查询凭证
                  </button>
                  <p>精确有效期至：{statusReceipt.expiresAt}</p>
                  <p>
                    凭证丢失后只能从这条已处理记录重新签发；旧凭证会立即失效，且有效期仍以原终态处理时间后
                    30 日为上限。
                  </p>
                  <p aria-live="polite">{receiptCopyStatus}</p>
                </section>
              ) : null}
              {selected.kind === 'claim' &&
              (selected.actions.canReissueTemporaryCredential ||
                selected.actions.canWithdrawConversion) ? (
                <section
                  className={styles.warning}
                  aria-labelledby="credential-recovery-title"
                >
                  <h3 id="credential-recovery-title">临时激活后续操作</h3>
                  <p>
                    重新签发会立刻使旧临时凭证失效并撤销现有会话；撤回转换会使账号回到等待用户重新提交认领，旧
                    Claim 仍保持终态。
                  </p>
                  <label>
                    <input
                      checked={confirmCredentialEffect}
                      onChange={(event) =>
                        setConfirmCredentialEffect(event.target.checked)
                      }
                      type="checkbox"
                    />
                    我已核对影响并确认继续
                  </label>
                  <div className={styles.actions}>
                    {selected.actions.canReissueTemporaryCredential ? (
                      <button
                        disabled={busy || !confirmCredentialEffect}
                        onClick={() =>
                          void (async () => {
                            setBusy(true)
                            try {
                              const value = await json(
                                adminClaimApi.reissueTemporaryCredential(
                                  selected.accountId!,
                                ),
                                {
                                  body: JSON.stringify({
                                    expectedVersion:
                                      selected.accountRecordVersion,
                                    reason: '管理员重新签发临时凭证',
                                  }),
                                  method: 'POST',
                                },
                              )
                              setCredential(
                                directConversionResultSchema.parse({
                                  temporaryCredential:
                                    value.temporaryCredential,
                                  temporaryCredentialExpiresAt:
                                    value.temporaryCredentialExpiresAt,
                                }),
                              )
                              setCredentialCopyStatus('')
                              setFeedback(
                                '新临时凭证仅显示一次；旧凭证与会话均已失效。',
                              )
                              setSelected(null)
                              await loadQueue()
                            } catch (error) {
                              setFeedback(
                                error instanceof Error
                                  ? error.message
                                  : '重新签发失败。',
                              )
                            } finally {
                              setBusy(false)
                            }
                          })()
                        }
                        type="button"
                      >
                        重新签发 72 小时临时凭证
                      </button>
                    ) : null}
                    {selected.actions.canWithdrawConversion ? (
                      <button
                        disabled={busy || !confirmCredentialEffect}
                        onClick={() =>
                          void mutate(
                            adminClaimApi.withdrawConversion(selected.id),
                            {
                              confirmEffects: true,
                              expectedAccountVersion:
                                selected.accountRecordVersion,
                              expectedClaimVersion: selected.recordVersion,
                              publicMessage: publicMessage.trim() || undefined,
                              reason: '管理员撤回直接激活转换',
                            },
                            '转换已撤回，旧临时凭证与会话失效；请通知用户重新设置正式密码并提交认领。',
                            'raw',
                          )
                        }
                        type="button"
                      >
                        撤回直接激活转换
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {selected.actions.canConvertToDirect ? (
                <section
                  className={styles.warning}
                  aria-labelledby="convert-exception-title"
                >
                  <div>
                    <h3 id="convert-exception-title">异常 / 更多操作</h3>
                    <p>终止认领并转换为临时凭证激活会造成：</p>
                    <ul>
                      <li>当前 Claim 成为只读终态；</li>
                      <li>申请人设置的正式密码立即失效；</li>
                      <li>账号进入 pendingActivation，尚未 active；</li>
                      <li>系统只显示一次 72 小时临时凭证。</li>
                    </ul>
                    <label>
                      <input
                        checked={confirmCredentialEffect}
                        onChange={(event) =>
                          setConfirmCredentialEffect(event.target.checked)
                        }
                        type="checkbox"
                      />
                      我已核对上述全部影响，确认终止当前认领
                    </label>
                    <button
                      type="button"
                      disabled={busy || !confirmCredentialEffect}
                      onClick={() =>
                        void mutate(
                          adminClaimApi.convert(selected.accountId!),
                          {
                            claimId: selected.id,
                            confirmEffects: true,
                            expectedAccountVersion:
                              selected.accountRecordVersion,
                            expectedClaimVersion: selected.recordVersion,
                            publicMessage: publicMessage.trim() || undefined,
                            reason,
                          },
                          '已终止认领并转换为临时凭证激活；请立即安全交付下方一次性临时凭证。',
                          true,
                        )
                      }
                    >
                      终止认领并转换为临时凭证激活
                    </button>
                  </div>
                </section>
              ) : null}
              <div className={styles.actions}>
                {selected.actions.canApprove ? (
                  <button
                    type="button"
                    disabled={busy || Boolean(staleDiff && !confirmStale)}
                    onClick={() => review('approve')}
                  >
                    {selected.kind === 'claim'
                      ? '批准认领并激活账号'
                      : '批准人工核验'}
                  </button>
                ) : null}
                {selected.actions.canReject ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => review('reject')}
                  >
                    拒绝
                  </button>
                ) : null}
                {selected.accountId ? (
                  <>
                    {selected.actions.canReopen ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            adminClaimApi.reopen(selected.accountId!),
                            {
                              expectedAccountVersion:
                                selected.accountRecordVersion,
                              expectedClaimVersion: selected.recordVersion,
                              publicMessage: publicMessage.trim() || undefined,
                              reason,
                            },
                            '认领已重新开放。请通知用户回到公开认领入口重新设置正式密码并提交。',
                          )
                        }
                      >
                        重新开放认领
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
