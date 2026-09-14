import Link from 'next/link'

import { AnnouncementSpectrumAxis } from './AnnouncementSpectrum'

export default function AnnouncementNotFound() {
  return (
    <main className="announcement-surface" id="main-content">
      <header className="announcement-detail-state-heading announcement-wrap">
        <p>404 · PUBLIC NOTICE</p>
        <h1>公告未找到</h1>
      </header>
      <AnnouncementSpectrumAxis />
      <div className="announcement-wrap announcement-state-layout">
        <section className="announcement-status-panel">
          <span aria-hidden="true">——</span>
          <div>
            <h2>没有找到这篇公告</h2>
            <p>它可能不存在、仍是草稿，或者已经下线。</p>
            <Link href="/announcements">← 返回公告列表</Link>
          </div>
        </section>
      </div>
    </main>
  )
}
