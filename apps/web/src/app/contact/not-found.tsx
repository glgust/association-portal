import Link from 'next/link'

import { ContactBackground } from './ContactBackground'

export default function ContactNotFound() {
  return (
    <main className="contact-shell" id="main-content">
      <ContactBackground />
      <div className="contact-status-shell">
        <nav aria-label="面包屑" className="contact-breadcrumbs">
          <Link href="/">首页</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">404</span>
        </nav>
        <section className="contact-status-panel">
          <p className="contact-status-eyebrow">404 · NOT FOUND</p>
          <h1>联系方式尚未公开</h1>
          <p>页面可能仍是草稿，或者已经下线。</p>
          <Link className="contact-status-action" href="/">
            ← 返回首页
          </Link>
        </section>
      </div>
    </main>
  )
}
