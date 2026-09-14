import type { CSSProperties } from 'react'

export function ActivityStatusPanel({
  description,
  requestId,
  title,
}: {
  description: string
  requestId?: string
  title: string
}) {
  return (
    <section
      className="activity-status-panel anim"
      role="status"
      style={{ '--d': '0.15s' } as CSSProperties}
    >
      <p className="activity-eyebrow">STATUS / 状态提示</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {requestId ? (
        <p className="activity-request-id">请求编号：{requestId}</p>
      ) : null}
    </section>
  )
}
