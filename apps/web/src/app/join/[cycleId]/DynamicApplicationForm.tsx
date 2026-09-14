'use client'

import {
  applicationResultSchema,
  publicFormSchema,
  type FormField,
  type PublicForm,
} from '@ascnucc/contracts'
import { useEffect, useState } from 'react'

export function DynamicApplicationForm({ cycleId }: { cycleId: string }) {
  const [form, setForm] = useState<PublicForm | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('正在加载表单…')

  useEffect(() => {
    fetch(`/api/recruitment/cycles/${cycleId}/form`)
      .then(async (response) => {
        if (!response.ok) throw new Error('表单暂不可用')
        return publicFormSchema.parse(await response.json())
      })
      .then((loaded) => {
        setForm(loaded)
        setMessage('')
      })
      .catch(() => setMessage('表单加载失败，请稍后重试。'))
  }, [cycleId])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!form) return
    setMessage('正在提交…')
    const response = await fetch(
      `/api/recruitment/cycles/${cycleId}/applications`,
      {
        body: JSON.stringify({ answers, formVersionId: form.formVersionId }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        method: 'POST',
      },
    )
    const body: unknown = await response.json()
    if (response.ok) {
      const result = applicationResultSchema.parse(body)
      setMessage(`提交成功，申请编号：${result.id}`)
    } else {
      const requestId =
        body && typeof body === 'object' && 'requestId' in body
          ? String(body.requestId)
          : '未知'
      setMessage(`提交失败，请重试或联系协会。请求编号：${requestId}`)
    }
  }

  if (!form) return <p>{message}</p>

  return (
    <form onSubmit={submit}>
      {form.schema.fields.map((field) => (
        <Field
          field={field}
          key={field.fieldId}
          onChange={(value) =>
            setAnswers((current) => ({ ...current, [field.fieldId]: value }))
          }
          value={answers[field.fieldId] ?? ''}
        />
      ))}
      <button type="submit">提交预报名</button>
      {message ? <p aria-live="polite">{message}</p> : null}
    </form>
  )
}

function Field({
  field,
  onChange,
  value,
}: {
  field: FormField
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
      <span>
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      {field.type === 'select' ? (
        <select
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          value={value}
        >
          <option value="">请选择</option>
          {field.options.map((option) => (
            <option key={option.optionId} value={option.optionId}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          maxLength={field.maxLength}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          value={value}
        />
      ) : (
        <input
          maxLength={field.maxLength}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          value={value}
        />
      )}
      {field.helpText ? <small>{field.helpText}</small> : null}
    </label>
  )
}
