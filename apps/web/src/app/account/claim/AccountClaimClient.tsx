'use client'

import {
  apiErrorSchema,
  membershipAccountClaimOptionsSchema,
  membershipAccountClaimResultSchema,
  membershipAccountClaimSubmitSchema,
  membershipIntakeApplicationResultSchema,
  membershipIntakeApplicationSubmitSchema,
  type MembershipIdentity,
  type MembershipIdentityOption,
} from '@ascnucc/contracts'
import { useEffect, useRef, useState } from 'react'

import styles from './account-claim.module.css'

type Mode = 'claim' | 'intake'
type ContactType = 'phone' | 'wechat' | 'qq' | 'other'
type ContactDraft = {
  id: string
  isPrimary: boolean
  label: string
  type: ContactType
  value: string
}
type Feedback = {
  fieldErrors?: Record<string, string>
  kind: 'conflict' | 'manual' | 'success' | 'unavailable' | 'validation'
  message: string
  requestId?: string
  statusReceipt?: string
  statusReceiptNotice?: string
}

const initialContact: ContactDraft = {
  id: 'contact-1',
  isPrimary: true,
  label: '',
  type: 'wechat',
  value: '',
}

const normalizeText = (value: string) => value.normalize('NFKC').trim()

function fieldErrorsFromIssues(
  issues: ReadonlyArray<{ message?: string; path?: PropertyKey[] }>,
) {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const path = issue.path?.map(String).join('.') ?? ''
    if (!(path in errors)) errors[path] = issue.message ?? '请检查此字段。'
  }
  return errors
}

function errorFeedback(value: unknown, status: number): Feedback {
  const parsed = apiErrorSchema.safeParse(value)
  if (!parsed.success) {
    return { kind: 'unavailable', message: '会员服务暂时不可用，请稍后重试。' }
  }
  if (status === 400 || parsed.data.code === 'VALIDATION_FAILED') {
    const issues = Array.isArray(parsed.data.details?.issues)
      ? (parsed.data.details.issues as Array<{
          message?: string
          path?: Array<number | string>
        }>)
      : []
    return {
      fieldErrors: fieldErrorsFromIssues(issues),
      kind: 'validation',
      message: '请检查表单中的字段。',
      requestId: parsed.data.requestId,
    }
  }
  if (status === 409 || parsed.data.code === 'CONFLICT') {
    return {
      kind: 'conflict',
      message: '本次提交与已有操作冲突，请核对资料或稍后重试。',
      requestId: parsed.data.requestId,
    }
  }
  return {
    kind: 'unavailable',
    message: '会员服务暂时不可用，请稍后重试。',
    requestId: parsed.data.requestId,
  }
}

export function AccountClaimClient() {
  const [mode, setMode] = useState<Mode>('claim')
  const [options, setOptions] = useState<MembershipIdentityOption[]>([])
  const [optionsState, setOptionsState] = useState<
    'empty' | 'loading' | 'ready' | 'unavailable'
  >('loading')
  const [membershipIdentity, setMembershipIdentity] =
    useState<MembershipIdentity>('member')
  const [fullName, setFullName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [major, setMajor] = useState('')
  const [contacts, setContacts] = useState<ContactDraft[]>([initialContact])
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [privacyPurposeAccepted, setPrivacyPurposeAccepted] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/membership/account-claim/options', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const value: unknown = await response.json().catch(() => undefined)
        if (!response.ok) throw new Error('Options unavailable')
        const parsed = membershipAccountClaimOptionsSchema.safeParse(value)
        if (!parsed.success) throw new Error('Invalid options response')
        setOptions(parsed.data.options)
        setOptionsState(parsed.data.options.length === 0 ? 'empty' : 'ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setOptionsState('unavailable')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus()
  }, [feedback])

  function switchMode(nextMode: Mode) {
    setMode(nextMode)
    setFeedback(null)
    setPassword('')
    setPasswordConfirmation('')
    idempotency.current = null
  }

  function updateContact(id: string, update: Partial<ContactDraft>) {
    setContacts((current) =>
      current.map((contact) =>
        contact.id === id ? { ...contact, ...update } : contact,
      ),
    )
  }

  function setPrimaryContact(id: string) {
    setContacts((current) =>
      current.map((contact) => ({
        ...contact,
        isPrimary: contact.id === id,
      })),
    )
  }

  function addContact() {
    if (contacts.length >= 8) return
    setContacts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        isPrimary: false,
        label: '',
        type: 'phone',
        value: '',
      },
    ])
  }

  function removeContact(id: string) {
    setContacts((current) => {
      if (current.length === 1) return current
      const filtered = current.filter((contact) => contact.id !== id)
      if (!filtered.some((contact) => contact.isPrimary)) {
        filtered[0] = { ...filtered[0], isPrimary: true }
      }
      return filtered
    })
  }

  function contactCommand() {
    return contacts.map((contact) => ({
      isPrimary: contact.isPrimary,
      label: contact.type === 'other' ? normalizeText(contact.label) : null,
      type: contact.type,
      value: normalizeText(contact.value),
    }))
  }

  function idempotencyKeyFor(command: object) {
    const fingerprint = JSON.stringify(command)
    if (idempotency.current?.fingerprint === fingerprint) {
      return idempotency.current.key
    }
    const key = crypto.randomUUID()
    idempotency.current = { fingerprint, key }
    return key
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const common = {
      contacts: contactCommand(),
      fullName: normalizeText(fullName),
      major: normalizeText(major) || null,
      membershipIdentity,
    }
    const candidate =
      mode === 'claim'
        ? {
            ...common,
            password,
            passwordConfirmation,
            studentNumber: normalizeText(studentNumber),
          }
        : {
            ...common,
            privacyPurposeAccepted,
            studentNumber: normalizeText(studentNumber) || null,
          }
    const schema =
      mode === 'claim'
        ? membershipAccountClaimSubmitSchema
        : membershipIntakeApplicationSubmitSchema
    const parsed = schema.safeParse(candidate)
    if (!parsed.success) {
      setFeedback({
        fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
        kind: 'validation',
        message: '请检查表单中的字段。',
      })
      return
    }

    const nonSecretFingerprint =
      mode === 'claim'
        ? {
            ...parsed.data,
            password: undefined,
            passwordConfirmation: undefined,
          }
        : parsed.data
    const key = idempotencyKeyFor(nonSecretFingerprint)
    setBusy(true)
    try {
      const response = await fetch(
        mode === 'claim'
          ? '/api/membership/account-claims'
          : '/api/membership/intake-applications',
        {
          body: JSON.stringify(parsed.data),
          headers: {
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          method: 'POST',
        },
      )
      const value: unknown = await response.json().catch(() => undefined)
      if (!response.ok) {
        setFeedback(errorFeedback(value, response.status))
        return
      }

      if (mode === 'claim') {
        const result = membershipAccountClaimResultSchema.safeParse(value)
        if (!result.success) throw new Error('Invalid claim response')
        setPassword('')
        setPasswordConfirmation('')
        if (result.data.outcome === 'manualVerificationRequired') {
          setFeedback({
            kind: 'manual',
            message:
              '无法通过快速路径完成认领。为保护会员资料，我们不会说明具体原因；请改用人工核验。',
            requestId: result.data.requestId,
          })
        } else {
          setFeedback({
            kind: 'success',
            message: '账号认领已提交审核。审核通过前账号仍不能登录。',
            requestId: result.data.requestId,
            statusReceipt: result.data.statusReceipt,
            statusReceiptNotice: result.data.statusReceiptNotice,
          })
        }
      } else {
        const result = membershipIntakeApplicationResultSchema.safeParse(value)
        if (!result.success) throw new Error('Invalid intake response')
        setFeedback({
          kind: 'success',
          message:
            '人工核验资料已提交。可使用下方一次性显示的查询凭证查看进度。',
          requestId: result.data.requestId,
          statusReceipt: result.data.statusReceipt,
          statusReceiptNotice: result.data.statusReceiptNotice,
        })
      }
      idempotency.current = null
    } catch {
      setFeedback({
        kind: 'unavailable',
        message: '会员服务暂时不可用，请稍后重试。',
      })
    } finally {
      setBusy(false)
    }
  }

  const errors = feedback?.fieldErrors ?? {}

  return (
    <section aria-labelledby="claim-path-title" className={styles.workspace}>
      <div className={styles.pathHeading}>
        <h2 id="claim-path-title">选择核验路径</h2>
        <p>有预配置记录和学号可快速认领；其他情况请提交人工核验。</p>
      </div>
      <div aria-label="核验路径" className={styles.modePicker} role="group">
        <button
          aria-pressed={mode === 'claim'}
          onClick={() => switchMode('claim')}
          type="button"
        >
          快速认领
          <small>匹配预配置记录并设置正式密码</small>
        </button>
        <button
          aria-pressed={mode === 'intake'}
          onClick={() => switchMode('intake')}
          type="button"
        >
          人工核验
          <small>不收集密码，由协会线下复核</small>
        </button>
      </div>

      {optionsState === 'loading' ? (
        <div aria-live="polite" className={styles.status} role="status">
          <h2>正在载入身份说明</h2>
          <p>请稍候。</p>
        </div>
      ) : optionsState === 'empty' ? (
        <div className={styles.status} role="status">
          <h2>暂时没有可选身份</h2>
          <p>请稍后重试或通过线下渠道联系协会。</p>
        </div>
      ) : optionsState === 'unavailable' ? (
        <div className={styles.status} role="alert">
          <h2>身份核验服务暂时不可用</h2>
          <p>请稍后重新载入页面。</p>
        </div>
      ) : (
        <form className={styles.form} noValidate onSubmit={submit}>
          {feedback ? (
            <div
              className={styles.feedback}
              ref={feedbackRef}
              role={feedback.kind === 'success' ? 'status' : 'alert'}
              tabIndex={-1}
            >
              <h2>
                {feedback.kind === 'validation'
                  ? '请修正以下内容'
                  : feedback.kind === 'manual'
                    ? '请改用人工核验'
                    : feedback.kind === 'success'
                      ? '提交成功'
                      : feedback.kind === 'conflict'
                        ? '提交发生冲突'
                        : '暂时无法提交'}
              </h2>
              <p>{feedback.message}</p>
              {feedback.requestId ? (
                <p>请求编号：{feedback.requestId}</p>
              ) : null}
              {feedback.statusReceipt ? (
                <div className={styles.receipt}>
                  <p>{feedback.statusReceiptNotice}</p>
                  <label>
                    认领进度查询凭证
                    <textarea
                      aria-describedby="status-receipt-warning"
                      autoComplete="off"
                      readOnly
                      rows={4}
                      value={feedback.statusReceipt}
                    />
                  </label>
                  <p id="status-receipt-warning">
                    查询凭证等同敏感凭据；请立即保存，不要公开转发，也不要作为登录密码使用。
                  </p>
                  <button
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        feedback.statusReceipt ?? '',
                      )
                    }
                    type="button"
                  >
                    复制查询凭证
                  </button>
                  <a href="/account/claim/status">前往认领进度查询</a>
                </div>
              ) : null}
              {Object.keys(errors).length > 0 ? (
                <ul>
                  {Object.entries(errors).map(([path, message]) => (
                    <li key={path}>{message}</li>
                  ))}
                </ul>
              ) : null}
              {feedback.kind === 'manual' ? (
                <button onClick={() => switchMode('intake')} type="button">
                  填写人工核验资料
                </button>
              ) : null}
            </div>
          ) : null}

          <fieldset className={styles.identityFieldset}>
            <legend>协会身份</legend>
            <p className={styles.hint}>
              身份用于匹配和展示，不会由申请人选择直接获得账号权限。
            </p>
            <div className={styles.identityGrid}>
              {options.map((option) => (
                <label
                  className={styles.identityCard}
                  key={option.membershipIdentity}
                >
                  <input
                    checked={membershipIdentity === option.membershipIdentity}
                    name="membershipIdentity"
                    onChange={() =>
                      setMembershipIdentity(option.membershipIdentity)
                    }
                    type="radio"
                    value={option.membershipIdentity}
                  />
                  <span>
                    <strong>{option.label}</strong>（{option.defaultRole}）
                  </span>
                  <small>{option.description}</small>
                  <small>
                    默认权限：
                    {option.defaultPermissionSummary.length > 0
                      ? option.defaultPermissionSummary.join('、')
                      : '无后台业务权限'}
                  </small>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.fields}>
            <label>
              姓名
              <input
                aria-describedby={
                  errors.fullName ? 'full-name-error' : undefined
                }
                aria-invalid={errors.fullName ? true : undefined}
                autoComplete="name"
                onChange={(event) => setFullName(event.target.value)}
                value={fullName}
              />
              {errors.fullName ? (
                <span id="full-name-error">{errors.fullName}</span>
              ) : null}
            </label>
            <label>
              学号{mode === 'intake' ? '（可选）' : ''}
              <input
                aria-describedby={
                  errors.studentNumber ? 'student-number-error' : undefined
                }
                aria-invalid={errors.studentNumber ? true : undefined}
                autoComplete="username"
                inputMode="numeric"
                onChange={(event) => setStudentNumber(event.target.value)}
                value={studentNumber}
              />
              {errors.studentNumber ? (
                <span id="student-number-error">{errors.studentNumber}</span>
              ) : null}
            </label>
            <label>
              专业（普通干事、部门干部必填）
              <input
                aria-describedby={errors.major ? 'major-error' : undefined}
                aria-invalid={errors.major ? true : undefined}
                onChange={(event) => setMajor(event.target.value)}
                value={major}
              />
              {errors.major ? (
                <span id="major-error">{errors.major}</span>
              ) : null}
            </label>
          </div>

          <fieldset className={styles.contacts}>
            <legend>联系方式</legend>
            <p className={styles.hint}>至少填写一种，仅用于协会内部联络。</p>
            {contacts.map((contact, index) => (
              <div className={styles.contactRow} key={contact.id}>
                <label>
                  类型
                  <select
                    onChange={(event) =>
                      updateContact(contact.id, {
                        label: '',
                        type: event.target.value as ContactType,
                      })
                    }
                    value={contact.type}
                  >
                    <option value="phone">电话</option>
                    <option value="wechat">微信</option>
                    <option value="qq">QQ</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                {contact.type === 'other' ? (
                  <label>
                    方式标签
                    <input
                      aria-describedby={
                        errors[`contacts.${index}.label`]
                          ? `contact-${index}-label-error`
                          : undefined
                      }
                      aria-invalid={
                        errors[`contacts.${index}.label`] ? true : undefined
                      }
                      onChange={(event) =>
                        updateContact(contact.id, { label: event.target.value })
                      }
                      value={contact.label}
                    />
                    {errors[`contacts.${index}.label`] ? (
                      <span id={`contact-${index}-label-error`}>
                        {errors[`contacts.${index}.label`]}
                      </span>
                    ) : null}
                  </label>
                ) : null}
                <label>
                  联系方式值
                  <input
                    aria-describedby={
                      errors[`contacts.${index}.value`]
                        ? `contact-${index}-value-error`
                        : undefined
                    }
                    aria-invalid={
                      errors[`contacts.${index}.value`] ? true : undefined
                    }
                    onChange={(event) =>
                      updateContact(contact.id, { value: event.target.value })
                    }
                    value={contact.value}
                  />
                  {errors[`contacts.${index}.value`] ? (
                    <span id={`contact-${index}-value-error`}>
                      {errors[`contacts.${index}.value`]}
                    </span>
                  ) : null}
                </label>
                <label className={styles.primaryChoice}>
                  <input
                    checked={contact.isPrimary}
                    name="primaryContact"
                    onChange={() => setPrimaryContact(contact.id)}
                    type="radio"
                  />
                  设为主要联系方式
                </label>
                {contacts.length > 1 ? (
                  <button
                    onClick={() => removeContact(contact.id)}
                    type="button"
                  >
                    删除此联系方式
                  </button>
                ) : null}
              </div>
            ))}
            {errors.contacts ? (
              <p className={styles.fieldError}>{errors.contacts}</p>
            ) : null}
            <button
              disabled={contacts.length >= 8}
              onClick={addContact}
              type="button"
            >
              添加联系方式
            </button>
          </fieldset>

          {mode === 'claim' ? (
            <fieldset className={styles.passwords}>
              <legend>设置正式密码</legend>
              <p className={styles.hint}>密码须为 12–128 个 Unicode 字符。</p>
              <label>
                正式密码
                <input
                  aria-describedby={
                    errors.password ? 'claim-password-error' : undefined
                  }
                  aria-invalid={errors.password ? true : undefined}
                  autoComplete="new-password"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
                {errors.password ? (
                  <span id="claim-password-error">{errors.password}</span>
                ) : null}
              </label>
              <label>
                确认正式密码
                <input
                  aria-describedby={
                    errors.passwordConfirmation
                      ? 'claim-confirmation-error'
                      : undefined
                  }
                  aria-invalid={errors.passwordConfirmation ? true : undefined}
                  autoComplete="new-password"
                  onChange={(event) =>
                    setPasswordConfirmation(event.target.value)
                  }
                  type="password"
                  value={passwordConfirmation}
                />
                {errors.passwordConfirmation ? (
                  <span id="claim-confirmation-error">
                    {errors.passwordConfirmation}
                  </span>
                ) : null}
              </label>
            </fieldset>
          ) : (
            <label className={styles.privacyChoice}>
              <input
                aria-describedby={
                  errors.privacyPurposeAccepted
                    ? 'privacy-purpose-error'
                    : undefined
                }
                aria-invalid={errors.privacyPurposeAccepted ? true : undefined}
                checked={privacyPurposeAccepted}
                onChange={(event) =>
                  setPrivacyPurposeAccepted(event.target.checked)
                }
                type="checkbox"
              />
              <span>
                我已了解：这些资料仅用于协会内部身份核验与联络，首次人工核验不会创建账号或收集密码。
              </span>
              {errors.privacyPurposeAccepted ? (
                <span id="privacy-purpose-error">
                  {errors.privacyPurposeAccepted}
                </span>
              ) : null}
            </label>
          )}

          <button className={styles.submit} disabled={busy} type="submit">
            {busy
              ? '正在提交…'
              : mode === 'claim'
                ? '提交账号认领审核'
                : '提交人工核验资料'}
          </button>
        </form>
      )}
    </section>
  )
}
