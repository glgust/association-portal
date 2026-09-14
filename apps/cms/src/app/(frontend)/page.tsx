import Link from 'next/link'

export default function CmsHomePage() {
  return (
    <main>
      <h1>天文协会 CMS Demo</h1>
      <p>此应用承载 Payload Admin 和后续业务用例。</p>
      <Link href="/admin">进入后台</Link>
    </main>
  )
}
