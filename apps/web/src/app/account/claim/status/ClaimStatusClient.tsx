'use client'

import {
  apiErrorSchema,
  membershipStatusQuerySchema,
  membershipStatusResultSchema,
  type MembershipStatusResult,
} from '@ascnucc/contracts'
import { useRef, useState } from 'react'

import styles from '../account-claim.module.css'

const statusLabels: Record<MembershipStatusResult['status'], string> = {
  accountDisabled: '账号已停用',
  approvedCanLogin: '审核已通过，可使用正式密码登录',
  intakeCompleted: '人工核验已完成',
  pendingReview: '等待审核',
  rejectedContactAssociation: '本次申请未通过',
  resubmissionRequired: '需要重新提交认领',
  temporaryActivationContactAdmin: '已转为临时凭证激活',
}

export function ClaimStatusClient() {
  const [receipt, setReceipt] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MembershipStatusResult | null>(null)
  const [error, setError] = useState('')
  const feedbackRef = useRef<HTMLDivElement>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setResult(null)
    const parsed = membershipStatusQuerySchema.safeParse({
      statusReceipt: receipt.trim(),
    })
    if (!parsed.success) {
      setError('查询凭证无效、已过期或已被替换。')
      queueMicrotask(() => feedbackRef.current?.focus())
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/membership/account-claim/status', {
        body: JSON.stringify(parsed.data),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const value: unknown = await response.json().catch(() => undefined)
      if (!response.ok) {
        apiErrorSchema.safeParse(value)
        setError('查询凭证无效、已过期或已被替换。')
      } else {
        const status = membershipStatusResultSchema.safeParse(value)
        if (!status.success) throw new Error('Invalid status response')
        setResult(status.data)
      }
    } catch {
      setError('进度查询服务暂时不可用，请稍后重试。')
    } finally {
      setBusy(false)
      queueMicrotask(() => feedbackRef.current?.focus())
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="status-query-title">
      <form className={styles.form} onSubmit={submit} noValidate>
        <h2 id="status-query-title">输入查询凭证</h2>
        <label>
          认领进度查询凭证
          <textarea
            autoComplete="off"
            onChange={(event) => setReceipt(event.target.value)}
            rows={4}
            value={receipt}
          />
        </label>
        <button className={styles.submit} disabled={busy} type="submit">
          {busy ? '正在查询…' : '查询进度'}
        </button>
      </form>
      {error ? (
        <div
          className={styles.feedback}
          ref={feedbackRef}
          role="alert"
          tabIndex={-1}
        >
          <h2>无法显示进度</h2>
          <p>{error}</p>
          <p>如需帮助，请通过协会既有线下渠道联系管理员。</p>
        </div>
      ) : null}
      {result ? (
        <div
          className={styles.feedback}
          ref={feedbackRef}
          role="status"
          tabIndex={-1}
        >
          <h2>{statusLabels[result.status]}</h2>
          {result.publicMessage ? <p>{result.publicMessage}</p> : null}
          <p>下一步：{result.nextStep}</p>
          <p>状态更新时间：{result.updatedAt}</p>
          <p>请求编号：{result.requestId}</p>
        </div>
      ) : null}
      <p>
        <a href="/account/claim">返回会员身份核验与账号申领</a>
      </p>
    </section>
  )
}
