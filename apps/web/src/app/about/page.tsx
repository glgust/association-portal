import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AboutPromotionLink } from './AboutPromotionLink'

import { PublicRichText } from '@/components/content/PublicRichText'
import {
  AssociationPageNotFoundError,
  AssociationPageUnavailableError,
  getPublicAboutPage,
} from '@/server/association-pages'

const siteDescription = '了解示例协会。'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await getPublicAboutPage()
    return {
      description: page.seoSummary ?? siteDescription,
      title: page.title,
    }
  } catch (error) {
    if (error instanceof AssociationPageNotFoundError) notFound()
    return { description: siteDescription, title: '协会介绍暂时不可用' }
  }
}

export default async function AboutPage() {
  const outcome = await loadAboutPage()
  if (outcome.status === 'not-found') notFound()
  if (outcome.status === 'unavailable') {
    return (
      <main className="association-shell" id="main-content">
        <nav aria-label="面包屑" className="association-breadcrumbs">
          <Link href="/">首页</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">关于协会</span>
        </nav>
        <section className="association-status" role="status">
          <p className="association-eyebrow">服务状态</p>
          <h1>协会介绍暂时无法载入</h1>
          <p>内容服务暂时不可用，请稍后再试。</p>
          <AboutPromotionLink />
          <p className="association-request-id">
            请求编号：{outcome.requestId}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main
      className="association-shell association-reading-shell"
      id="main-content"
    >
      <nav aria-label="面包屑" className="association-breadcrumbs">
        <Link href="/">首页</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">关于协会</span>
      </nav>
      <article>
        <header className="association-heading">
          <p className="association-eyebrow">关于协会</p>
          <h1>{outcome.page.title}</h1>
          <AboutPromotionLink />
          {outcome.page.seoSummary ? (
            <p className="association-summary">{outcome.page.seoSummary}</p>
          ) : null}
        </header>
        <div className="association-body">
          <PublicRichText body={outcome.page.body} />
        </div>
      </article>
    </main>
  )
}

async function loadAboutPage() {
  try {
    return { page: await getPublicAboutPage(), status: 'ready' as const }
  } catch (error) {
    if (error instanceof AssociationPageNotFoundError) {
      return { status: 'not-found' as const }
    }
    if (error instanceof AssociationPageUnavailableError) {
      return { requestId: error.requestId, status: 'unavailable' as const }
    }
    throw error
  }
}
