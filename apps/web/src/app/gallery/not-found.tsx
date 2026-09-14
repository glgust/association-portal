import Link from 'next/link'

export default function GalleryNotFound() {
  return (
    <main className="gallery-shell gallery-detail-shell" id="main-content">
      <section className="gallery-status">
        <p className="gallery-eyebrow">404</p>
        <h1>没有找到这件作品</h1>
        <p>作品可能尚未发布、已经下线，或地址有误。</p>
        <Link href="/gallery">返回作品列表</Link>
      </section>
    </main>
  )
}
