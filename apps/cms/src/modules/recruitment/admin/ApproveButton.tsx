'use client'

import { useState } from 'react'

export function ApproveButton({ applicationId, expectedVersion }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  )
  const [message, setMessage] = useState('')

  async function approve() {
    setState('loading')
    setMessage('')
    const response = await fetch(
      `/api/v1/admin/applications/${applicationId}/approve`,
      {
        body: JSON.stringify({ expectedVersion }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    )
    const body = (await response.json()) as {
      code?: string
      requestId?: string
    }
    if (response.ok) {
      setState('success')
      setMessage('已通过；刷新页面可查看最新队列。')
    } else {
      setState('error')
      setMessage(
        `${body.code ?? 'ERROR'} · ${body.requestId ?? 'no-request-id'}`,
      )
    }
  }

  return (
    <div>
      <button
        disabled={state === 'loading' || state === 'success'}
        onClick={approve}
        type="button"
      >
        {state === 'loading'
          ? '处理中…'
          : state === 'success'
            ? '已通过'
            : '审核通过'}
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  )
}

type Props = {
  applicationId: string
  expectedVersion: number
}
