import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { PublicRichText } from '@/components/content/PublicRichText'
import {
  AssociationPageNotFoundError,
  AssociationPageUnavailableError,
  getPublicHomePage,
} from '@/server/association-pages'

import {
  HomeAnnouncementSection,
  HomeContactSection,
  loadHomeSections,
} from './home-sections'
import { HomeSky } from './HomeSky'
import styles from './home.module.css'

const siteDescription = '示例协会的信息与服务门户。'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const home = await getPublicHomePage()
    return {
      description: home.seoSummary ?? siteDescription,
      title: home.title,
    }
  } catch {
    return {
      description: siteDescription,
      title: '首页暂时不可用',
    }
  }
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  )
}

export async function HomeContent() {
  const outcome = await loadHome()
  if (outcome.status !== 'ready') {
    return <HomeStatus outcome={outcome} />
  }

  const home = outcome.home
  const sections = await loadHomeSections()
  return (
    <main className={styles.surface} id="main-content">
      <HomeSky />

      <div className={styles.contentLayer}>
        <section aria-labelledby="home-title" className={styles.hero}>
          <header className={styles.masthead}>
            <p className={styles.eyebrow}>
              Astronomy Association · Observation Origin
            </p>
            <h1 id="home-title">{home.title}</h1>
            <ConstellationDivider />
            {home.lead ? <p className={styles.lead}>{home.lead}</p> : null}
          </header>

          <HomeAnnouncementSection data={sections.announcements} />
        </section>

        <nav aria-label="协会信息" className={styles.entries}>
          <HomeEntry
            description="了解协会历史、宗旨与观测传统。"
            href="/about"
            index="01"
            label="About"
            title="关于协会"
          />
          <HomeEntry
            description="查看已发布的观测与科普活动。"
            href="/activities"
            index="02"
            label="Activities"
            title="活动目录"
          />
          <HomeEntry
            description="浏览协会新闻与近期记录。"
            href="/news"
            index="03"
            label="News"
            title="协会新闻"
          />
          <HomeEntry
            description="浏览协会公开作品与天文影像。"
            href="/gallery"
            index="04"
            label="Gallery"
            title="协会作品"
          />
          <HomeEntry
            description="查找协会公开联系方式。"
            href="/contact"
            index="05"
            label="Contact"
            title="联系我们"
          />
        </nav>

        <section className={styles.lowerDeck}>
          <div className={`association-body ${styles.richText}`}>
            <p className={styles.sectionKicker}>Observation Notes · 协会手记</p>
            <PublicRichText body={home.body} />
          </div>
          <HomeContactSection data={sections.contacts} />
        </section>

        <footer className={styles.footerMark}>
          <span>PORTAL</span>
          <span aria-hidden="true">RA 23h 08m · DEC +23° 08′</span>
        </footer>
      </div>
    </main>
  )
}

function HomeEntry({
  description,
  href,
  index,
  label,
  title,
}: {
  description: string
  href: string
  index: string
  label: string
  title: string
}) {
  return (
    <Link className={styles.entry} href={href} prefetch={false}>
      <span className={styles.entryTag}>
        {index} · {label}
      </span>
      <strong>{title}</strong>
      <span className={styles.rule} aria-hidden="true" />
      <span className={styles.entryDescription}>{description}</span>
    </Link>
  )
}

function ConstellationDivider() {
  return (
    <svg aria-hidden="true" className={styles.divider} viewBox="0 0 120 24">
      <line x1="0" x2="30" y1="12" y2="12" />
      <line x1="90" x2="120" y1="12" y2="12" />
      <line x1="42" x2="60" y1="16" y2="7" />
      <line x1="60" x2="78" y1="7" y2="14" />
      <circle cx="42" cy="16" r="1.6" />
      <circle cx="60" cy="7" r="2" />
      <circle cx="78" cy="14" r="1.6" />
    </svg>
  )
}

export function HomeStatus({
  outcome,
}: {
  outcome:
    | { status: 'not-found' }
    | { requestId: string; status: 'unavailable' }
}) {
  return (
    <main className={styles.surface} id="main-content">
      <HomeSky />
      <div className={styles.statusLayout}>
        <section className={styles.statusPanel} role="status">
          <p className={styles.eyebrow}>Service Status · 服务状态</p>
          {outcome.status === 'not-found' ? (
            <>
              <h1>首页尚未配置或尚未发布</h1>
              <p>请由内容管理员在 CMS 中创建首页、保存草稿并完成发布。</p>
            </>
          ) : (
            <>
              <h1>首页暂时无法载入</h1>
              <p>协会基础信息服务暂时不可用，请稍后再试。</p>
              <p className="association-request-id">
                请求编号：{outcome.requestId}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function HomeLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className={styles.surface}
      id="main-content"
    >
      <HomeSky />
      <div className={styles.statusLayout}>
        <section className={styles.statusPanel}>
          <p className={styles.eyebrow}>PORTAL · 协会门户</p>
          <h1>正在载入首页</h1>
          <p>请稍候。</p>
        </section>
      </div>
    </main>
  )
}

async function loadHome() {
  try {
    return { home: await getPublicHomePage(), status: 'ready' as const }
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
