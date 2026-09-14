import Link from 'next/link'

import { AboutPromotionLink } from './AboutPromotionLink'

export default function AboutNotFound() {
  return (
    <main className="association-shell" id="main-content">
      <section className="association-status">
        <p className="association-eyebrow">404</p>
        <h1>协会介绍尚未公开</h1>
        <p>页面可能仍是草稿，或者已经下线。</p>
        <AboutPromotionLink />
        <Link href="/">返回首页</Link>
      </section>
    </main>
  )
}
