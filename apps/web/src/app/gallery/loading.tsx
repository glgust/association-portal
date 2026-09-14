export default function GalleryLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="gallery-shell"
      id="main-content"
    >
      <header className="gallery-heading">
        <p className="gallery-eyebrow">PORTAL · 协会门户</p>
        <h1>协会作品</h1>
      </header>
      <section className="gallery-status">
        <h2>正在载入作品</h2>
        <p>请稍候。</p>
      </section>
    </main>
  )
}
