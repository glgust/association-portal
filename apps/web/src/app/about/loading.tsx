export default function AboutLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="association-shell"
      id="main-content"
    >
      <section className="association-status">
        <p className="association-eyebrow">关于协会</p>
        <h1>正在载入协会介绍</h1>
        <p>请稍候。</p>
      </section>
    </main>
  )
}
