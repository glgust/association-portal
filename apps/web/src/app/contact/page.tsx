import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PublicRichText } from '@/components/content/PublicRichText'
import {
  AssociationPageNotFoundError,
  AssociationPageUnavailableError,
  getPublicContactPage,
} from '@/server/association-pages'

import { ContactBackground } from './ContactBackground'
import { ContactDirectory } from './ContactDirectory'

const siteDescription = '查看示例协会公开的联系方式。'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await getPublicContactPage()
    return {
      description: page.seoSummary ?? siteDescription,
      title: page.title,
    }
  } catch (error) {
    if (error instanceof AssociationPageNotFoundError) notFound()
    return { description: siteDescription, title: '联系方式暂时不可用' }
  }
}

export default async function ContactPage() {
  const outcome = await loadContactPage()
  if (outcome.status === 'not-found') notFound()

  if (outcome.status === 'unavailable') {
    return (
      <main className="contact-shell" id="main-content">
        <ContactBackground />
        <div className="contact-status-shell">
          <nav aria-label="面包屑" className="contact-breadcrumbs">
            <Link href="/">首页</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">联系方式</span>
          </nav>
          <section className="contact-status-panel" role="status">
            <p className="contact-status-eyebrow">服务状态 · SERVICE STATUS</p>
            <h1>联系方式暂时无法载入</h1>
            <p>内容服务暂时不可用，请稍后再试。</p>
            <p className="contact-status-request-id">
              请求编号：{outcome.requestId}
            </p>
          </section>
        </div>
      </main>
    )
  }

  const page = outcome.page
  const contacts = page.contacts
  const types = new Set(contacts.map((contact) => contact.type))
  const homeCount = contacts.filter((contact) => contact.showOnHome).length

  return (
    <main className="contact-shell contact-enter" id="main-content">
      <ContactBackground />

      <nav aria-label="面包屑" className="contact-sr-only">
        <Link href="/">首页</Link>
        <span>/</span>
        <span aria-current="page">{page.title}</span>
      </nav>

      <div className="contact-view">
        <header className="contact-masthead">
          <div
            className="contact-mast-meta contact-anim-line"
            style={{ '--d': '0s' } as React.CSSProperties}
          >
            <span>PORTAL · CONTACT DIRECTORY · {page.title}</span>
            <span>PAGE — CONTACT</span>
          </div>

          <h1
            aria-label={`${page.title} — CONTACT / SIGNAL`}
            className="contact-mast-title contact-anim"
            style={{ '--d': '0.12s' } as React.CSSProperties}
          >
            CONTACT
            <span aria-hidden="true" className="contact-slash">
              {' / '}
            </span>
            <span aria-hidden="true" className="contact-outline">
              SIGNAL
            </span>
          </h1>

          <div className="contact-mast-lede">
            {page.seoSummary ? (
              <p
                className="contact-mast-lede-text contact-anim"
                style={{ '--d': '0.3s' } as React.CSSProperties}
              >
                {page.seoSummary}
              </p>
            ) : (
              <div
                aria-hidden="true"
                className="contact-mast-lede-placeholder"
              />
            )}
            <div
              aria-label="渠道统计"
              className="contact-mast-stats contact-anim"
              style={{ '--d': '0.4s' } as React.CSSProperties}
            >
              <div className="contact-stat">
                <span className="contact-stat-num">
                  {String(contacts.length).padStart(2, '0')}
                </span>
                <span className="contact-stat-lab">登记渠道</span>
              </div>
              <div className="contact-stat">
                <span className="contact-stat-num">
                  {String(types.size).padStart(2, '0')}
                </span>
                <span className="contact-stat-lab">渠道类型</span>
              </div>
              <div className="contact-stat">
                <span className="contact-stat-num">
                  {String(homeCount).padStart(2, '0')}
                </span>
                <span className="contact-stat-lab">首页展示</span>
              </div>
            </div>
          </div>
        </header>

        <ContactDirectory contacts={contacts} />

        {hasRichTextContent(page.body) ? (
          <section aria-label="通讯说明" className="contact-notes">
            <div aria-hidden="true" className="contact-notes-rail">
              <span>NOTES · 通讯说明</span>
            </div>
            <div
              className="contact-notes-text contact-anim"
              style={{ '--d': '0.2s' } as React.CSSProperties}
            >
              <PublicRichText body={page.body} />
            </div>
          </section>
        ) : null}

        <footer className="contact-colophon">
          <span>PORTAL · CONTACT DIRECTORY</span>
          <span>PORTAL · 示例协会</span>
        </footer>
      </div>
    </main>
  )
}

async function loadContactPage() {
  try {
    return { page: await getPublicContactPage(), status: 'ready' as const }
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

function hasRichTextContent(body: { blocks: unknown[] }) {
  return body.blocks.some((block) => {
    if (typeof block !== 'object' || block === null) return false
    if ('children' in block && Array.isArray(block.children)) {
      return block.children.some((child) => {
        if (typeof child === 'object' && child !== null && 'text' in child) {
          return typeof child.text === 'string' && child.text.trim().length > 0
        }
        return true
      })
    }
    if ('items' in block && Array.isArray(block.items)) {
      return block.items.length > 0
    }
    return true
  })
}
