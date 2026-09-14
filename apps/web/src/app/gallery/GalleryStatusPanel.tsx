export function GalleryStatusPanel({
  description,
  requestId,
  title,
}: {
  description: string
  requestId?: string
  title: string
}) {
  return (
    <section className="gallery-status" role="status">
      <h2>{title}</h2>
      <p>{description}</p>
      {requestId ? (
        <p className="gallery-request-id">请求编号：{requestId}</p>
      ) : null}
    </section>
  )
}
