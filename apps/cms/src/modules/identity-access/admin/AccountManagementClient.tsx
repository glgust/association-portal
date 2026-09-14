'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  accountDetailSchema,
  accountListResultSchema,
  accountSummarySchema,
  temporaryCredentialResultSchema,
  type AccountDetailDto,
  type AccountSummaryDto,
  type ManagementCapabilities,
} from '../dto'
import {
  permissionLabel,
  permissionUsage,
} from '@/modules/admin-experience/permission-copy'

import styles from './account-management.module.css'

type FeedbackKind =
  | 'conflict'
  | 'forbidden'
  | 'success'
  | 'unavailable'
  | 'validation'

type Feedback = {
  fieldErrors?: Record<string, string>
  kind: FeedbackKind
  message: string
  requestId?: string
}

type CredentialResult = {
  account: AccountSummaryDto
  temporaryCredential: string
  temporaryCredentialExpiresAt: string
}

type ApiErrorBody = {
  code?: string
  details?: {
    issues?: Array<{
      message?: string
      path?: Array<number | string>
    }>
  }
  error?: { code?: string; message?: string; requestId?: string }
  message?: string
  requestId?: string
}

class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error?.message ?? body.message ?? 'Request failed')
  }
}

type EditableRole = 'member' | 'staff' | 'cadre' | 'admin'

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiFailure(0, { message: '网络连接失败，请稍后重试。' })
  }

  const body = (await response.json().catch(() => ({}))) as ApiErrorBody
  if (!response.ok) throw new ApiFailure(response.status, body)
  return body
}

function feedbackFrom(error: unknown): Feedback {
  if (!(error instanceof ApiFailure)) {
    return { kind: 'unavailable', message: '账号服务暂时不可用，请稍后重试。' }
  }
  const code = error.body.error?.code ?? error.body.code
  const requestId = error.body.error?.requestId ?? error.body.requestId
  if (error.status === 401) {
    return {
      kind: 'forbidden',
      message: '登录状态已失效，请重新登录。',
      requestId,
    }
  }
  if (error.status === 403) {
    return {
      kind: 'forbidden',
      message: '当前账号没有执行此操作的权限。',
      requestId,
    }
  }
  if (error.status === 409 || code === 'CONFLICT') {
    return {
      kind: 'conflict',
      message: '账号已被其他操作更新。请刷新详情后重试。',
      requestId,
    }
  }
  if (error.status === 400 || code === 'VALIDATION_FAILED') {
    const fieldErrors = Object.fromEntries(
      (error.body.details?.issues ?? []).flatMap((issue) => {
        const first = issue.path?.[0]
        return typeof first === 'string'
          ? [[first, issue.message ?? '请检查此字段。']]
          : []
      }),
    )
    return {
      fieldErrors,
      kind: 'validation',
      message: error.message || '请检查表单中的字段。',
      requestId,
    }
  }
  return {
    kind: 'unavailable',
    message: '账号服务暂时不可用，请稍后重试。',
    requestId,
  }
}

function parseAccountSummary(value: unknown): AccountSummaryDto {
  const candidate =
    value && typeof value === 'object' && 'account' in value
      ? (value as { account: unknown }).account
      : value
  return accountSummarySchema.parse(candidate)
}

function parseAccountDetail(value: unknown): AccountDetailDto {
  return accountDetailSchema.parse(value)
}

function toDateTimeLocal(value: null | string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIsoOrNull(value: string): null | string {
  return value ? new Date(value).toISOString() : null
}

function fieldErrorAttributes(message: string | undefined, id: string) {
  return message
    ? ({ 'aria-describedby': id, 'aria-invalid': true } as const)
    : {}
}

export function AccountManagementClient() {
  const [accounts, setAccounts] = useState<AccountSummaryDto[]>([])
  const [capabilities, setCapabilities] = useState<ManagementCapabilities>({
    targetRoles: [],
  })
  const [selected, setSelected] = useState<AccountDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [credential, setCredential] = useState<CredentialResult | null>(null)
  const [copyStatus, setCopyStatus] = useState('')

  const [accountType, setAccountType] = useState<'external' | 'student'>(
    'student',
  )
  const [loginName, setLoginName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [createRole, setCreateRole] = useState<EditableRole>('staff')
  const [createReason, setCreateReason] = useState('')

  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRole, setEditRole] = useState<EditableRole>('staff')
  const [editExpiry, setEditExpiry] = useState('')
  const [actionReason, setActionReason] = useState('')

  const [permission, setPermission] = useState('')
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow')
  const [scopeType, setScopeType] = useState<'global' | 'recruitmentCycle'>(
    'global',
  )
  const [cycleId, setCycleId] = useState('')
  const [overrideExpiry, setOverrideExpiry] = useState('')

  const permissionOptions = useMemo(
    () => selected?.capabilities.settablePermissions ?? [],
    [selected],
  )
  const effectivePermission =
    permissionOptions.find((item) => item.permission === permission) ??
    permissionOptions[0]
  const effectiveScope =
    effectivePermission?.scopes.find((item) => item === scopeType) ??
    effectivePermission?.scopes[0] ??
    'global'
  const fieldError = (path: string) => feedback?.fieldErrors?.[path]

  function applySelected(account: AccountDetailDto | null) {
    setSelected(account)
    if (!account) return
    setEditDisplayName(account.displayName)
    setEditRole(account.role === 'owner' ? 'admin' : account.role)
    setEditExpiry(toDateTimeLocal(account.defaultRoleExpiresAt))
    const firstPermission = account.capabilities.settablePermissions[0]
    setPermission(firstPermission?.permission ?? '')
    setScopeType(firstPermission?.scopes[0] ?? 'global')
  }

  function showFeedback(next: Feedback) {
    setFeedback(next)
  }

  async function refreshList(preferredId?: string) {
    setLoading(true)
    try {
      const next = accountListResultSchema.parse(
        await requestJson('/api/v1/admin/accounts'),
      )
      setAccounts(next.accounts)
      setCapabilities(next.capabilities)
      const targetId = preferredId ?? selected?.id
      const target =
        (targetId
          ? next.accounts.find((account) => account.id === targetId)
          : null) ?? next.accounts[0]
      applySelected(
        target
          ? parseAccountDetail(
              await requestJson(`/api/v1/admin/accounts/${target.id}`),
            )
          : null,
      )
    } catch (error) {
      showFeedback(feedbackFrom(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void requestJson('/api/v1/admin/accounts')
      .then((value) => accountListResultSchema.parse(value))
      .then(async (next) => {
        if (!active) return
        setAccounts(next.accounts)
        setCapabilities(next.capabilities)
        const first = next.accounts[0]
        const detail = first
          ? parseAccountDetail(
              await requestJson(`/api/v1/admin/accounts/${first.id}`),
            )
          : null
        if (active) applySelected(detail)
      })
      .catch((error: unknown) => {
        if (active) setFeedback(feedbackFrom(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function selectAccount(id: string) {
    setCredential(null)
    setCopyStatus('')
    setDetailLoading(true)
    setFeedback(null)
    try {
      applySelected(
        parseAccountDetail(await requestJson(`/api/v1/admin/accounts/${id}`)),
      )
    } catch (error) {
      showFeedback(feedbackFrom(error))
    } finally {
      setDetailLoading(false)
    }
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFeedback(null)
    setCredential(null)
    try {
      const result = temporaryCredentialResultSchema.parse(
        await requestJson('/api/v1/admin/accounts', {
          body: JSON.stringify({
            accountType,
            displayName,
            loginName: accountType === 'student' ? studentNumber : loginName,
            reason: createReason,
            role: createRole,
            studentNumber: accountType === 'student' ? studentNumber : null,
          }),
          method: 'POST',
        }),
      )
      setCredential(result)
      setCopyStatus('')
      setLoginName('')
      setStudentNumber('')
      setDisplayName('')
      setCreateReason('')
      showFeedback({
        kind: 'success',
        message:
          '账号已创建。请立即安全交付临时凭证，并请用户在登录页激活区设置正式密码。',
      })
      await refreshList(result.account.id)
    } catch (error) {
      showFeedback(feedbackFrom(error))
    } finally {
      setBusy(false)
    }
  }

  async function updateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || selected.role === 'owner') return
    setBusy(true)
    setFeedback(null)
    try {
      const updated = parseAccountSummary(
        await requestJson(`/api/v1/admin/accounts/${selected.id}`, {
          body: JSON.stringify({
            defaultRoleExpiresAt:
              editRole === 'staff' ? toIsoOrNull(editExpiry) : null,
            displayName: editDisplayName,
            expectedVersion: selected.recordVersion,
            reason: actionReason,
            role: editRole,
          }),
          method: 'PATCH',
        }),
      )
      showFeedback({ kind: 'success', message: '账号资料已更新。' })
      await refreshList(updated.id)
    } catch (error) {
      showFeedback(feedbackFrom(error))
    } finally {
      setBusy(false)
    }
  }

  async function accountAction(
    action: 'disable' | 'reenable' | 'reissue' | 'reset',
  ) {
    if (!selected || selected.role === 'owner') return
    const labels = {
      disable: '停用',
      reenable: '重新启用',
      reissue: '重新签发临时凭证',
      reset: '重置凭证',
    }
    if (
      !window.confirm(
        `确认${labels[action]}账号 ${selected.loginName}（${selected.role}）？`,
      )
    )
      return
    setBusy(true)
    setFeedback(null)
    setCredential(null)
    try {
      const claimAwareDisable =
        action === 'disable' &&
        ['pendingClaim', 'pendingApproval', 'claimBlocked'].includes(
          selected.status,
        )
      const value = await requestJson(
        claimAwareDisable
          ? `/api/v1/admin/member-account-claims/accounts/${selected.id}/disable`
          : `/api/v1/admin/accounts/${selected.id}/${action}`,
        {
          body: JSON.stringify(
            claimAwareDisable
              ? {
                  expectedAccountVersion: selected.recordVersion,
                  reason: actionReason,
                }
              : {
                  expectedVersion: selected.recordVersion,
                  reason: actionReason,
                },
          ),
          method: 'POST',
        },
      )
      if (action === 'reset' || action === 'reenable' || action === 'reissue') {
        const result = temporaryCredentialResultSchema.parse(value)
        setCredential(result)
      } else if (!claimAwareDisable) {
        parseAccountSummary(value)
      }
      showFeedback({
        kind: 'success',
        message:
          action === 'disable'
            ? '账号已停用，旧会话已撤销；需要恢复时从此页执行重新启用。'
            : '操作成功。请立即安全交付新的临时凭证，并请用户在登录页激活区设置正式密码。',
      })
      await refreshList(selected.id)
    } catch (error) {
      showFeedback(feedbackFrom(error))
    } finally {
      setBusy(false)
    }
  }

  async function setPermissionOverride(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (!selected || selected.role === 'owner' || !effectivePermission) return
    setBusy(true)
    setFeedback(null)
    try {
      await requestJson(`/api/v1/admin/accounts/${selected.id}/overrides`, {
        body: JSON.stringify({
          effect,
          expectedVersion: selected.recordVersion,
          expiresAt: toIsoOrNull(overrideExpiry),
          permission: effectivePermission.permission,
          reason: actionReason,
          recruitmentCycleId:
            effectiveScope === 'recruitmentCycle' ? cycleId : null,
          scopeType: effectiveScope,
        }),
        method: 'POST',
      })
      const updated = parseAccountDetail(
        await requestJson(`/api/v1/admin/accounts/${selected.id}`),
      )
      applySelected(updated)
      showFeedback({
        kind: 'success',
        message: '权限覆盖已设置，并将在下一请求生效。',
      })
      await refreshList(updated.id)
    } catch (error) {
      showFeedback(feedbackFrom(error))
    } finally {
      setBusy(false)
    }
  }

  async function revokeOverride(overrideId: string, permissionName: string) {
    if (!selected || selected.role === 'owner') return
    if (
      !window.confirm(
        `确认撤销 ${selected.loginName} 的 ${permissionName} 权限覆盖？`,
      )
    )
      return
    setBusy(true)
    setFeedback(null)
    try {
      await requestJson(
        `/api/v1/admin/accounts/${selected.id}/overrides/${overrideId}/revoke`,
        {
          body: JSON.stringify({
            expectedVersion: selected.recordVersion,
            reason: actionReason,
          }),
          method: 'POST',
        },
      )
      const updated = parseAccountDetail(
        await requestJson(`/api/v1/admin/accounts/${selected.id}`),
      )
      applySelected(updated)
      showFeedback({
        kind: 'success',
        message: '权限覆盖已撤销，历史记录仍保留。',
      })
      await refreshList(updated.id)
    } catch (error) {
      showFeedback(feedbackFrom(error))
    } finally {
      setBusy(false)
    }
  }

  async function copyCredential() {
    if (!credential) return
    try {
      await navigator.clipboard.writeText(credential.temporaryCredential)
      setCopyStatus('临时凭证已复制。')
    } catch {
      setCopyStatus('复制失败，请手动选择并复制。')
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>IDENTITY ACCESS</p>
          <h1>后台账号与权限</h1>
          <p>创建、激活交付、权限调整、重置和停用均通过受控业务入口完成。</p>
        </div>
        <button
          disabled={loading || busy}
          onClick={() => void refreshList()}
          type="button"
        >
          刷新账号
        </button>
      </header>

      <aside className={styles.guidance} aria-labelledby="account-flow-title">
        <h2 id="account-flow-title">直接建号与临时凭证</h2>
        <p>
          直接创建账号不以申请或认领为前置条件；创建成功会立即签发只显示一次、72
          小时有效的临时凭证。用户必须回到登录页的激活区，用该凭证设置正式密码。
        </p>
      </aside>

      {feedback ? (
        <div
          className={`${styles.feedback} ${styles[feedback.kind]}`}
          role={feedback.kind === 'success' ? 'status' : 'alert'}
        >
          <strong>{feedback.message}</strong>
          {feedback.requestId ? (
            <span>请求编号：{feedback.requestId}</span>
          ) : null}
          {feedback.kind === 'conflict' ? (
            <button
              onClick={() => void refreshList(selected?.id)}
              type="button"
            >
              刷新详情
            </button>
          ) : null}
        </div>
      ) : null}

      {credential ? (
        <section
          className={styles.credential}
          aria-labelledby="credential-title"
        >
          <div>
            <h2 id="credential-title">一次性临时凭证</h2>
            <p>
              只在当前页面内存中显示一次，刷新后无法找回。请在 72
              小时内通过个人渠道安全交付，勿发送到公共群。交付后请用户在登录页激活区设置正式密码。
            </p>
          </div>
          <output className={styles.secret} aria-label="临时凭证">
            {credential.temporaryCredential}
          </output>
          <p>
            失效时间：
            {new Date(credential.temporaryCredentialExpiresAt).toLocaleString()}
          </p>
          <button onClick={() => void copyCredential()} type="button">
            复制临时凭证
          </button>
          <p aria-live="polite" className={styles.copyStatus}>
            {copyStatus}
          </p>
        </section>
      ) : null}

      <div className={styles.layout}>
        <aside className={styles.panel} aria-labelledby="account-list-title">
          <div className={styles.panelHeading}>
            <h2 id="account-list-title">账号</h2>
            <span>{accounts.length}</span>
          </div>
          {loading ? <p role="status">正在加载账号…</p> : null}
          {!loading && accounts.length === 0 ? (
            <p>尚无可管理账号。可使用右侧表单创建第一条账号。</p>
          ) : null}
          {!loading && accounts.length > 0 ? (
            <ul className={styles.accountList}>
              {accounts.map((account) => (
                <li key={account.id}>
                  <button
                    aria-current={
                      selected?.id === account.id ? 'true' : undefined
                    }
                    className={styles.accountButton}
                    onClick={() => void selectAccount(account.id)}
                    type="button"
                  >
                    <strong>{account.loginName}</strong>
                    <span>{account.displayName}</span>
                    <span>
                      {account.role} · {account.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>

        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="create-title">
            <h2 id="create-title">创建单个账号</h2>
            <form className={styles.form} onSubmit={createAccount}>
              <label>
                账号类型
                <select
                  value={accountType}
                  onChange={(event) =>
                    setAccountType(event.target.value as 'student' | 'external')
                  }
                >
                  <option value="student">学生账号</option>
                  <option value="external">外部协作者</option>
                </select>
              </label>
              {accountType === 'student' ? (
                <label>
                  学号（同时作为登录名）
                  <input
                    {...fieldErrorAttributes(
                      fieldError('studentNumber'),
                      'create-student-number-error',
                    )}
                    inputMode="numeric"
                    maxLength={32}
                    minLength={6}
                    pattern="[0-9]{6,32}"
                    required
                    value={studentNumber}
                    onChange={(event) => setStudentNumber(event.target.value)}
                  />
                  {fieldError('studentNumber') ? (
                    <span id="create-student-number-error">
                      {fieldError('studentNumber')}
                    </span>
                  ) : null}
                </label>
              ) : (
                <label>
                  登录名
                  <input
                    {...fieldErrorAttributes(
                      fieldError('loginName'),
                      'create-login-name-error',
                    )}
                    autoCapitalize="none"
                    maxLength={32}
                    minLength={3}
                    pattern="[a-z][a-z0-9._-]{2,31}"
                    required
                    value={loginName}
                    onChange={(event) => setLoginName(event.target.value)}
                  />
                  {fieldError('loginName') ? (
                    <span id="create-login-name-error">
                      {fieldError('loginName')}
                    </span>
                  ) : null}
                </label>
              )}
              <label>
                显示名
                <input
                  {...fieldErrorAttributes(
                    fieldError('displayName'),
                    'create-display-name-error',
                  )}
                  maxLength={100}
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                {fieldError('displayName') ? (
                  <span id="create-display-name-error">
                    {fieldError('displayName')}
                  </span>
                ) : null}
              </label>
              <label>
                角色
                <select
                  {...fieldErrorAttributes(
                    fieldError('role'),
                    'create-role-error',
                  )}
                  value={createRole}
                  onChange={(event) =>
                    setCreateRole(event.target.value as EditableRole)
                  }
                >
                  {capabilities.targetRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {fieldError('role') ? (
                  <span id="create-role-error">{fieldError('role')}</span>
                ) : null}
              </label>
              <label>
                创建原因
                <textarea
                  {...fieldErrorAttributes(
                    fieldError('reason'),
                    'create-reason-error',
                  )}
                  maxLength={500}
                  required
                  value={createReason}
                  onChange={(event) => setCreateReason(event.target.value)}
                />
                {fieldError('reason') ? (
                  <span id="create-reason-error">{fieldError('reason')}</span>
                ) : null}
              </label>
              <button disabled={busy} type="submit">
                {busy ? '处理中…' : '创建并签发凭证'}
              </button>
            </form>
          </section>

          <section className={styles.panel} aria-labelledby="detail-title">
            <h2 id="detail-title">账号详情与操作</h2>
            {detailLoading ? <p role="status">正在加载详情…</p> : null}
            {!detailLoading && !selected ? (
              <p>选择一个账号以查看详情。</p>
            ) : null}
            {selected ? (
              <>
                <dl className={styles.summary}>
                  <div>
                    <dt>登录名</dt>
                    <dd>{selected.loginName}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>{selected.statusPresentation.label}</dd>
                  </div>
                  <div>
                    <dt>状态说明</dt>
                    <dd>
                      {selected.statusPresentation.explanation}
                      {selected.statusPresentation.reviewHref ? (
                        <>
                          {' '}
                          <a href={selected.statusPresentation.reviewHref}>
                            前往会员认领审核
                          </a>
                        </>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>版本</dt>
                    <dd>{selected.recordVersion}</dd>
                  </div>
                  <div>
                    <dt>账号类型</dt>
                    <dd>{selected.accountType}</dd>
                  </div>
                </dl>
                {selected.role === 'owner' ? (
                  <p className={styles.ownerNotice}>
                    系统所有者不在普通账号管理入口中修改。
                  </p>
                ) : (
                  <>
                    <form className={styles.form} onSubmit={updateAccount}>
                      <label>
                        显示名
                        <input
                          {...fieldErrorAttributes(
                            fieldError('displayName'),
                            'edit-display-name-error',
                          )}
                          maxLength={100}
                          required
                          value={editDisplayName}
                          onChange={(event) =>
                            setEditDisplayName(event.target.value)
                          }
                        />
                        {fieldError('displayName') ? (
                          <span id="edit-display-name-error">
                            {fieldError('displayName')}
                          </span>
                        ) : null}
                      </label>
                      <label>
                        角色
                        <select
                          {...fieldErrorAttributes(
                            fieldError('role'),
                            'edit-role-error',
                          )}
                          value={editRole}
                          onChange={(event) =>
                            setEditRole(event.target.value as EditableRole)
                          }
                        >
                          {capabilities.targetRoles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        {fieldError('role') ? (
                          <span id="edit-role-error">{fieldError('role')}</span>
                        ) : null}
                      </label>
                      <label>
                        默认角色期限
                        <input
                          {...fieldErrorAttributes(
                            fieldError('defaultRoleExpiresAt'),
                            'edit-expiry-error',
                          )}
                          disabled={editRole !== 'staff'}
                          type="datetime-local"
                          value={editRole === 'staff' ? editExpiry : ''}
                          onChange={(event) =>
                            setEditExpiry(event.target.value)
                          }
                        />
                        {fieldError('defaultRoleExpiresAt') ? (
                          <span id="edit-expiry-error">
                            {fieldError('defaultRoleExpiresAt')}
                          </span>
                        ) : null}
                      </label>
                      <label>
                        操作原因（同时用于下方操作）
                        <textarea
                          {...fieldErrorAttributes(
                            fieldError('reason'),
                            'action-reason-error',
                          )}
                          maxLength={500}
                          required
                          value={actionReason}
                          onChange={(event) =>
                            setActionReason(event.target.value)
                          }
                        />
                        {fieldError('reason') ? (
                          <span id="action-reason-error">
                            {fieldError('reason')}
                          </span>
                        ) : null}
                      </label>
                      <button disabled={busy} type="submit">
                        保存资料
                      </button>
                    </form>
                    <div
                      className={styles.dangerActions}
                      aria-label="凭证和状态操作"
                    >
                      {selected.status === 'active' ? (
                        <button
                          disabled={busy || !actionReason.trim()}
                          onClick={() => void accountAction('reset')}
                          type="button"
                        >
                          重置凭证
                        </button>
                      ) : null}
                      {selected.status === 'disabled' ? (
                        <button
                          disabled={busy || !actionReason.trim()}
                          onClick={() => void accountAction('reenable')}
                          type="button"
                        >
                          重新启用并签发凭证
                        </button>
                      ) : (
                        <button
                          className={styles.dangerButton}
                          disabled={busy || !actionReason.trim()}
                          onClick={() => void accountAction('disable')}
                          type="button"
                        >
                          停用账号
                        </button>
                      )}
                      {selected.status === 'pendingActivation' ? (
                        <button
                          disabled={busy || !actionReason.trim()}
                          onClick={() => void accountAction('reissue')}
                          type="button"
                        >
                          重新签发临时凭证
                        </button>
                      ) : null}
                    </div>

                    <h3>权限覆盖</h3>
                    {selected.overrides?.length ? (
                      <ul className={styles.overrideList}>
                        {selected.overrides.map((override) => (
                          <li key={override.id}>
                            <span>
                              <strong>{override.permission}</strong> ·{' '}
                              {override.effect} · {override.scopeType}
                            </span>
                            <button
                              disabled={busy || !actionReason.trim()}
                              onClick={() =>
                                void revokeOverride(
                                  override.id,
                                  override.permission,
                                )
                              }
                              type="button"
                            >
                              撤销
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>当前没有活动权限覆盖。</p>
                    )}
                    <form
                      className={styles.form}
                      onSubmit={setPermissionOverride}
                    >
                      <div className={styles.field}>
                        <label htmlFor="override-permission">权限</label>
                        <select
                          aria-describedby={`override-permission-help${
                            fieldError('permission')
                              ? ' override-permission-error'
                              : ''
                          }`}
                          aria-invalid={
                            fieldError('permission') ? true : undefined
                          }
                          id="override-permission"
                          value={effectivePermission?.permission ?? ''}
                          onChange={(event) =>
                            setPermission(event.target.value)
                          }
                        >
                          {permissionOptions.map((item) => (
                            <option
                              key={item.permission}
                              value={item.permission}
                            >
                              {permissionLabel(item.permission)}
                            </option>
                          ))}
                        </select>
                        {effectivePermission ? (
                          <small id="override-permission-help">
                            {permissionUsage(effectivePermission.permission)}
                          </small>
                        ) : (
                          <small id="override-permission-help">
                            当前角色没有可设置的权限。
                          </small>
                        )}
                        {fieldError('permission') ? (
                          <span id="override-permission-error">
                            {fieldError('permission')}
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="override-effect">效果</label>
                        <select
                          aria-describedby="override-effect-help"
                          id="override-effect"
                          value={effect}
                          onChange={(event) =>
                            setEffect(event.target.value as 'allow' | 'deny')
                          }
                        >
                          <option value="allow">允许</option>
                          <option value="deny">拒绝</option>
                        </select>
                        <small id="override-effect-help">
                          允许会增加能力；拒绝优先于角色默认和允许覆盖，用于立即收回能力。
                        </small>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="override-scope">范围</label>
                        <select
                          aria-describedby={`override-scope-help${
                            fieldError('scopeType')
                              ? ' override-scope-error'
                              : ''
                          }`}
                          aria-invalid={
                            fieldError('scopeType') ? true : undefined
                          }
                          disabled={
                            (effectivePermission?.scopes.length ?? 0) <= 1
                          }
                          id="override-scope"
                          value={effectiveScope}
                          onChange={(event) =>
                            setScopeType(
                              event.target.value as
                                | 'global'
                                | 'recruitmentCycle',
                            )
                          }
                        >
                          {(effectivePermission?.scopes ?? []).map((scope) => (
                            <option key={scope} value={scope}>
                              {scope === 'global' ? '全局' : '指定招新届次'}
                            </option>
                          ))}
                        </select>
                        <small id="override-scope-help">
                          全局作用于全部记录；指定招新届次只作用于填写的届次
                          ID。
                        </small>
                        {fieldError('scopeType') ? (
                          <span id="override-scope-error">
                            {fieldError('scopeType')}
                          </span>
                        ) : null}
                      </div>
                      {effectiveScope === 'recruitmentCycle' ? (
                        <label>
                          招新届次 ID
                          <input
                            {...fieldErrorAttributes(
                              fieldError('recruitmentCycleId'),
                              'override-cycle-error',
                            )}
                            required
                            value={cycleId}
                            onChange={(event) => setCycleId(event.target.value)}
                          />
                          {fieldError('recruitmentCycleId') ? (
                            <span id="override-cycle-error">
                              {fieldError('recruitmentCycleId')}
                            </span>
                          ) : null}
                        </label>
                      ) : null}
                      <div className={styles.field}>
                        <label htmlFor="override-expiry">
                          覆盖期限（可选）
                        </label>
                        <input
                          aria-describedby={`override-expiry-help${
                            fieldError('expiresAt')
                              ? ' override-expiry-error'
                              : ''
                          }`}
                          aria-invalid={
                            fieldError('expiresAt') ? true : undefined
                          }
                          id="override-expiry"
                          type="datetime-local"
                          value={overrideExpiry}
                          onChange={(event) =>
                            setOverrideExpiry(event.target.value)
                          }
                        />
                        <small id="override-expiry-help">
                          到期后覆盖自动失效；留空表示持续有效，需人工撤销。
                        </small>
                        {fieldError('expiresAt') ? (
                          <span id="override-expiry-error">
                            {fieldError('expiresAt')}
                          </span>
                        ) : null}
                      </div>
                      <button
                        disabled={busy || !actionReason.trim()}
                        type="submit"
                      >
                        设置权限覆盖
                      </button>
                    </form>
                  </>
                )}
              </>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}
