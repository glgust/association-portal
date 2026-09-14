'use client'

import { useState } from 'react'

import styles from './activation.module.css'

type ApiErrorBody = {
  details?: {
    issues?: Array<{ message?: string; path?: Array<number | string> }>
  }
}

export function ActivationForm() {
  const [loginName, setLoginName] = useState('')
  const [temporaryCredential, setTemporaryCredential] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setFieldErrors({})
    try {
      const response = await fetch('/api/v1/auth/activate', {
        body: JSON.stringify({
          loginName,
          newPassword,
          newPasswordConfirmation: confirmation,
          temporaryCredential,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody
        setFieldErrors(
          Object.fromEntries(
            (body.details?.issues ?? []).flatMap((issue) => {
              const first = issue.path?.[0]
              return typeof first === 'string'
                ? [[first, issue.message ?? '请检查此字段。']]
                : []
            }),
          ),
        )
        setMessage(
          response.status === 400
            ? '请检查密码长度（12–128 字符）和确认值。'
            : '激活失败。请检查输入，或联系管理员重新签发临时凭证。',
        )
        return
      }
      setTemporaryCredential('')
      setNewPassword('')
      setConfirmation('')
      setMessage('激活成功。请使用正式密码在上方重新登录。')
    } catch {
      setMessage('激活服务暂时不可用，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.activation} aria-labelledby="activation-title">
      <h2 id="activation-title">首次激活或重置后设置密码</h2>
      <p>临时凭证仅可用于此处激活，成功后请使用正式密码重新登录。</p>
      <form onSubmit={submit}>
        <label>
          登录名
          <input
            autoCapitalize="none"
            autoComplete="username"
            required
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
          />
        </label>
        <label>
          临时凭证
          <input
            autoComplete="one-time-code"
            required
            type="password"
            value={temporaryCredential}
            onChange={(event) => setTemporaryCredential(event.target.value)}
          />
        </label>
        <label>
          正式密码（12–128 字符）
          <input
            aria-describedby={
              fieldErrors.newPassword ? 'activation-password-error' : undefined
            }
            aria-invalid={fieldErrors.newPassword ? true : undefined}
            autoComplete="new-password"
            required
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          {fieldErrors.newPassword ? (
            <span id="activation-password-error">
              {fieldErrors.newPassword}
            </span>
          ) : null}
        </label>
        <label>
          确认正式密码
          <input
            aria-describedby={
              fieldErrors.newPasswordConfirmation
                ? 'activation-confirmation-error'
                : undefined
            }
            aria-invalid={
              fieldErrors.newPasswordConfirmation ? true : undefined
            }
            autoComplete="new-password"
            required
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {fieldErrors.newPasswordConfirmation ? (
            <span id="activation-confirmation-error">
              {fieldErrors.newPasswordConfirmation}
            </span>
          ) : null}
        </label>
        <button disabled={busy} type="submit">
          {busy ? '正在激活…' : '激活账号'}
        </button>
      </form>
      <p aria-live="polite" role="status">
        {message}
      </p>
    </section>
  )
}
