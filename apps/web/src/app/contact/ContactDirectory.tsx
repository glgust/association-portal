'use client'

import type { PublicAssociationContact } from '@ascnucc/contracts'
import { useState } from 'react'

const TYPE_LABEL: Record<PublicAssociationContact['type'], string> = {
  email: 'Email',
  other: 'Info',
  phone: 'Phone',
  qq: 'QQ',
  wechat: 'WeChat',
}

interface CopyState {
  id: string | null
  status: 'copied' | 'failed' | 'idle'
}

export function ContactDirectory({
  contacts,
}: {
  contacts: PublicAssociationContact[]
}) {
  const [copyState, setCopyState] = useState<CopyState>({
    id: null,
    status: 'idle',
  })
  const [liveMessage, setLiveMessage] = useState('')

  async function handleCopy(contactId: string, value: string, label: string) {
    let success = false
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        success = true
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        success = document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    } catch {
      success = false
    }

    if (success) {
      setCopyState({ id: contactId, status: 'copied' })
      setLiveMessage(`已复制 ${label}`)
      setTimeout(() => {
        setCopyState((prev) =>
          prev.id === contactId ? { id: null, status: 'idle' } : prev,
        )
      }, 1600)
    } else {
      setCopyState({ id: contactId, status: 'failed' })
      setLiveMessage(`复制 ${label} 失败，请手动选择复制`)
      setTimeout(() => {
        setCopyState((prev) =>
          prev.id === contactId ? { id: null, status: 'idle' } : prev,
        )
      }, 2000)
    }
  }

  return (
    <section
      aria-labelledby="contact-directory-heading"
      className="contact-dir"
    >
      <div
        className="contact-dir-head contact-anim"
        style={{ '--d': '0.5s' } as React.CSSProperties}
      >
        <span id="contact-directory-heading">DIRECTORY / 联络目录</span>
      </div>

      <div aria-live="polite" className="contact-sr-only">
        {liveMessage}
      </div>

      {contacts.length > 0 ? (
        contacts.map((contact, index) => {
          const rowDelay = (0.25 + index * 0.07).toFixed(2)
          const isCopied =
            copyState.id === contact.contactId && copyState.status === 'copied'
          const isFailed =
            copyState.id === contact.contactId && copyState.status === 'failed'

          return (
            <div
              className="contact-dir-row contact-anim"
              key={contact.contactId}
              style={{ '--d': `${rowDelay}s` } as React.CSSProperties}
            >
              <span className="contact-dir-no">
                C-{String(index + 1).padStart(2, '0')}
              </span>
              <span className="contact-dir-type">
                {TYPE_LABEL[contact.type]}
              </span>
              <div className="contact-dir-main">
                <span className="contact-dir-label">
                  {contact.label}
                  {contact.showOnHome ? (
                    <span className="contact-home-tag">HOME</span>
                  ) : null}
                </span>
                {contact.note ? (
                  <span className="contact-dir-note">{contact.note}</span>
                ) : null}
              </div>
              <span className="contact-dir-value">{contact.value}</span>

              {contact.type === 'email' ? (
                <a
                  aria-label={`写信给 ${contact.label}`}
                  className="contact-dir-act"
                  href={contact.href}
                >
                  <span aria-hidden="true" className="contact-dot" />
                  写信 →
                </a>
              ) : contact.type === 'phone' ? (
                <a
                  aria-label={`拨打 ${contact.label}`}
                  className="contact-dir-act"
                  href={contact.href}
                >
                  <span aria-hidden="true" className="contact-dot" />
                  拨打 →
                </a>
              ) : (
                <button
                  aria-label={`复制 ${contact.label}`}
                  className={`contact-dir-act${isCopied ? ' copied is-copied' : ''}${isFailed ? ' is-failed' : ''}`}
                  onClick={() =>
                    handleCopy(contact.contactId, contact.value, contact.label)
                  }
                  type="button"
                >
                  <span aria-hidden="true" className="contact-dot" />
                  <span className="contact-act-t">
                    {isCopied ? '已复制' : isFailed ? '复制失败' : '复制'}
                  </span>
                </button>
              )}
            </div>
          )
        })
      ) : (
        <p className="contact-dir-empty">暂无公开联络渠道。</p>
      )}
    </section>
  )
}
