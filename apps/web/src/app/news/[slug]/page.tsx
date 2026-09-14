import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PublicRichText } from '@/components/content/PublicRichText'
import { loadPublicNewsDetail, NewsNotFoundError } from '@/server/news'

import { NewsBackground } from '../NewsBackground'
import { NewsStatusPanel } from '../NewsStatusPanel'

const siteDescription = '阅读示例协会发布的新闻内容与档案记录。'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const outcome = await loadPublicNewsDetail(slug)
  if (outcome.data) {
    return {
      description: outcome.data.summary ?? siteDescription,
      title: outcome.data.title,
    }
  }
  return {
    description: siteDescription,
    robots: { index: false },
    title:
      outcome.error instanceof NewsNotFoundError
        ? '新闻不存在'
        : '新闻详情暂不可用',
  }
}

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const outcome = await loadPublicNewsDetail(slug)
  if (outcome.error instanceof NewsNotFoundError) notFound()

  if (outcome.error) {
    return (
      <main className="news-shell enter" id="main-content">
        <NewsBackground />
        <article aria-label="新闻详情暂不可用" className="view">
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
              REF UNAVAILABLE
            </span>
          </div>
          <NewsStatusPanel
            description="新闻服务暂时无法连接，请稍后再试。"
            requestId={outcome.error.requestId}
            title="暂时无法载入新闻"
          />
        </article>
      </main>
    )
  }

  const news = outcome.data
  const parts = getZonedDateParts(news.publishedAt)

  return (
    <main className="news-shell enter" id="main-content">
      <NewsBackground year={parts.year} />

      <article aria-label={news.title} className="view">
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
            REF {parts.ref}
          </span>
        </div>

        {/* 元数据带：严格网格（REF / 发布日期 / 星期 / SLUG） */}
        <div
          className="art-meta anim"
          style={{ '--d': '.12s' } as React.CSSProperties}
        >
          <div className="cell">
            <span className="k">档案号 / REF</span>
            <span className="v big">{parts.ref}</span>
          </div>
          <div className="cell">
            <span className="k">发布日期 / PUBLISHED</span>
            <span className="v">{parts.ymd}</span>
          </div>
          <div className="cell">
            <span className="k">星期 / WEEKDAY</span>
            <span className="v">{parts.weekday}</span>
          </div>
          <div className="cell">
            <span className="k">标识 / SLUG</span>
            <span className="v slug">{news.slug}</span>
          </div>
        </div>

        {/* 标题区 */}
        <header className="art-head">
          <p
            className="art-kicker anim"
            style={{ '--d': '.2s' } as React.CSSProperties}
          >
            NEWS ARCHIVE · {parts.ref}
          </p>
          <h1
            className="art-title anim"
            style={{ '--d': '.28s' } as React.CSSProperties}
          >
            {news.title}
          </h1>
          {news.summary ? (
            <p
              className="art-lede anim"
              style={{ '--d': '.38s' } as React.CSSProperties}
            >
              {news.summary}
            </p>
          ) : null}
        </header>

        {/* 超大日期排版：纯文本切片的视觉入口 */}
        <div
          className="time-hero anim"
          style={{ '--d': '.44s' } as React.CSSProperties}
        >
          <div className="big">{parts.monthDay}</div>
          <div className="sub">
            <div className="t1">{parts.weekday}</div>
            <div className="t2">{parts.year} · PUBLISHED</div>
          </div>
        </div>

        {/* 正文：较窄阅读栏，左对齐于网格第 2 列 */}
        <div className="art-body">
          <div aria-hidden="true" className="art-rail">
            <span>RECORD · {parts.ref}</span>
          </div>
          <section aria-label="新闻正文" className="art-text">
            <PublicRichText body={news.body} />
          </section>
        </div>

        {/* 详情底栏导航（3A 双列网格架构：返回索引 / 回到顶部） */}
        <nav aria-label="档案导航" className="art-nav">
          <Link href="/news">
            <span className="k">← 返回档案索引</span>
            <span className="t">新闻档案库 / INDEX</span>
          </Link>
          <a href="#main-content">
            <span className="k">回到顶部 ↑</span>
            <span className="t">回到档案顶部 / TOP</span>
          </a>
        </nav>

        <footer className="colophon">
          <span>PORTAL NEWS ARCHIVE — 示例协会</span>
          <span>{parts.ref} · 已归档</span>
        </footer>
      </article>
    </main>
  )
}

interface ZonedDateParts {
  day: string
  month: string
  monthDay: string
  ref: string
  weekday: string
  year: string
  ymd: string
}

function getZonedDateParts(isoString: string): ZonedDateParts {
  const date = new Date(isoString)
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    year: 'numeric',
  })
  const parts = formatter.formatToParts(date)
  const find = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const year = find('year')
  const month = find('month')
  const day = find('day')
  const weekday = find('weekday')
  return {
    day,
    month,
    monthDay: `${month}.${day}`,
    ref: `${year}.${month}${day}`,
    weekday,
    year,
    ymd: `${year}.${month}.${day}`,
  }
}
