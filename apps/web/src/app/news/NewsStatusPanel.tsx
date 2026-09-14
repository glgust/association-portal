export function NewsStatusPanel({
  description,
  requestId,
  title,
}: {
  description: string
  requestId?: string
  title: string
}) {
  return (
    <section className="news-status-panel" role="status">
      <p className="news-eyebrow">SYSTEM · ARCHIVE NOTICE</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {requestId ? (
        <p className="news-request-id">请求编号：{requestId}</p>
      ) : null}
    </section>
  )
}
