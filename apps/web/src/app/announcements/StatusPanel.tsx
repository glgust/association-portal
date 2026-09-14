export function StatusPanel({
  description,
  requestId,
  title,
}: {
  description: string
  requestId?: string
  title: string
}) {
  return (
    <section className="announcement-status-panel" role="status">
      <span aria-hidden="true">——</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {requestId ? (
          <p className="announcement-request-id">请求编号：{requestId}</p>
        ) : null}
      </div>
    </section>
  )
}
