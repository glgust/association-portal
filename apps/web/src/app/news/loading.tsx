import { NewsBackground } from './NewsBackground'

export default function NewsLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="news-shell enter"
      id="main-content"
    >
      <NewsBackground />
      <div className="view">
        <header className="masthead">
          <div
            className="mast-meta anim-line"
            style={{ '--d': '0s' } as React.CSSProperties}
          >
            <span>PORTAL · NEWS ARCHIVE · 新闻档案库</span>
            <span>LOADING · 检索中</span>
          </div>
          <h1
            className="mast-title anim"
            style={{ '--d': '.12s' } as React.CSSProperties}
          >
            NEWS<span className="slash"> / </span>
            <span className="outline">ARCHIVE</span>
          </h1>
        </header>
        <section className="news-status-panel">
          <p className="news-eyebrow">ARCHIVE RETRIEVAL</p>
          <h2>正在载入新闻档案</h2>
          <p>正在从档案馆读取目录记录，请稍候。</p>
        </section>
      </div>
    </main>
  )
}
