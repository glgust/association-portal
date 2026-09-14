import Link from 'next/link'

import { NewsBackground } from './NewsBackground'

export default function NewsNotFound() {
  return (
    <main className="news-shell enter" id="main-content">
      <NewsBackground />
      <div className="view">
        <div className="back-row">
          <Link
            className="back-link anim"
            href="/news"
            style={{ '--d': '0s' } as React.CSSProperties}
          >
            返回档案索引
          </Link>
          <span
            className="back-no anim"
            style={{ '--d': '.05s' } as React.CSSProperties}
          >
            REF 404 · NOT FOUND
          </span>
        </div>
        <section className="news-status-panel">
          <p className="news-eyebrow">404 · ARCHIVE RECORD NOT FOUND</p>
          <h1>没有找到这篇新闻</h1>
          <p>
            该档案记录可能不存在、仍处于草稿阶段，或者已从公开目录正常下线。
          </p>
          <Link href="/news">返回新闻档案库</Link>
        </section>
      </div>
    </main>
  )
}
