import type { Metadata } from 'next'
import Link from 'next/link'

import { getPublicNewsPage, NewsUnavailableError } from '@/server/news'

import { NewsBackground } from './NewsBackground'
import { NewsStatusPanel } from './NewsStatusPanel'

export const metadata: Metadata = {
  description: '浏览示例协会发布的新闻与协会动态档案。',
  title: '新闻档案 · PORTAL',
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; year?: string | string[] }>
}) {
  const resolvedParams = await searchParams
  const requestedPage = normalizePage(resolvedParams.page)
  const requestedYear = normalizeYear(resolvedParams.year)
  const outcome = await loadPage(requestedPage)

  if (outcome.error) {
    return (
      <main className="news-shell enter" id="main-content">
        <NewsBackground />
        <div className="view">
          <header className="masthead">
            <div
              className="mast-meta anim-line"
              style={{ '--d': '0s' } as React.CSSProperties}
            >
              <span>PORTAL · NEWS ARCHIVE · 新闻档案库</span>
              <span>SYSTEM · UNAVAILABLE</span>
            </div>
            <h1
              className="mast-title anim"
              style={{ '--d': '.12s' } as React.CSSProperties}
            >
              NEWS<span className="slash"> / </span>
              <span className="outline">ARCHIVE</span>
            </h1>
          </header>
          <NewsStatusPanel
            description="新闻服务暂时无法连接，请稍后再试。"
            requestId={outcome.error.requestId}
            title="暂时无法载入新闻"
          />
        </div>
      </main>
    )
  }

  const allItems = outcome.data.items
  const availableYears = Array.from(
    new Set(allItems.map((item) => getZonedDateParts(item.publishedAt).year)),
  ).sort((a, b) => Number(b) - Number(a))

  // R1 B2: 保留合法 requestedYear，不因当前卷无该年份而静默重置为 all
  const activeYear = requestedYear ?? 'all'

  const filterYears = Array.from(
    new Set([...availableYears, ...(activeYear !== 'all' ? [activeYear] : [])]),
  ).sort((a, b) => Number(b) - Number(a))

  const displayedItems =
    activeYear === 'all'
      ? allItems
      : allItems.filter(
          (item) => getZonedDateParts(item.publishedAt).year === activeYear,
        )

  const topYear =
    filterYears[0] ?? availableYears[0] ?? String(new Date().getFullYear())

  const groups: Array<{
    items: typeof displayedItems
    key: string
    month: string
    year: string
  }> = []

  for (const item of displayedItems) {
    const parts = getZonedDateParts(item.publishedAt)
    const key = `${parts.year}-${parts.month}`
    const lastGroup = groups[groups.length - 1]
    if (!lastGroup || lastGroup.key !== key) {
      groups.push({
        items: [item],
        key,
        month: parts.month,
        year: parts.year,
      })
    } else {
      lastGroup.items.push(item)
    }
  }

  return (
    <main className="news-shell enter" id="main-content">
      <NewsBackground year={activeYear === 'all' ? topYear : activeYear} />

      <div className="view">
        <header className="masthead">
          <div
            className="mast-meta anim-line"
            style={{ '--d': '0s' } as React.CSSProperties}
          >
            <span>PORTAL · NEWS ARCHIVE · 新闻档案库</span>
            <span>
              VOL.{pad2(outcome.data.page)} — {topYear}
            </span>
          </div>

          <h1
            className="mast-title anim"
            style={{ '--d': '.12s' } as React.CSSProperties}
          >
            NEWS<span className="slash"> / </span>
            <span className="outline">ARCHIVE</span>
          </h1>

          <div className="mast-lede">
            <p className="anim" style={{ '--d': '.3s' } as React.CSSProperties}>
              记录协会的每一步，也珍藏共同仰望的时刻。在这里，读到最新动态，重温星空下的故事。
            </p>
            <div
              className="mast-stats anim"
              style={{ '--d': '.4s' } as React.CSSProperties}
            >
              <span className="stat">
                <span className="num">{pad2(outcome.data.totalItems)}</span>
                <span className="lab">收录总数</span>
              </span>
              <span className="stat">
                <span className="num">
                  {pad2(outcome.data.page)} / {pad2(outcome.data.totalPages)}
                </span>
                <span className="lab">卷册 / 总卷</span>
              </span>
              <span className="stat">
                <span className="num">{pad2(displayedItems.length)}</span>
                <span className="lab">本卷条目</span>
              </span>
            </div>
          </div>
        </header>

        {/* 筛选栏（年份归档） */}
        <div
          aria-label="按年份筛选"
          className="filterbar anim"
          role="group"
          style={{ '--d': '.5s' } as React.CSSProperties}
        >
          <span className="cap">YEAR / 年份归档</span>
          <Link
            aria-pressed={activeYear === 'all'}
            className={activeYear === 'all' ? 'active' : ''}
            href={buildFilterHref(outcome.data.page, 'all')}
          >
            全部
          </Link>
          {filterYears.map((year) => (
            <Link
              aria-pressed={activeYear === year}
              className={activeYear === year ? 'active' : ''}
              href={buildFilterHref(outcome.data.page, year)}
              key={year}
            >
              {year}
            </Link>
          ))}
          <span className="count">{pad2(displayedItems.length)} 条记录</span>
        </div>

        {/* 列表主体 */}
        <div id="list">
          {displayedItems.length === 0 ? (
            <p className="empty">
              {allItems.length === 0
                ? '暂时没有公开新闻'
                : '该年份在当前卷暂无收录记录'}
            </p>
          ) : (
            groups.map((group) => (
              <section aria-label={group.key} className="group" key={group.key}>
                <div className="group-mark">
                  <span className="ym">
                    {group.month}
                    <b>{group.year}</b>
                  </span>
                </div>
                <ul className="group-rows">
                  {group.items.map((item, index) => {
                    const parts = getZonedDateParts(item.publishedAt)
                    return (
                      <li key={item.id}>
                        <Link
                          aria-label={item.title}
                          className="item anim"
                          href={`/news/${item.slug}`}
                          style={
                            {
                              '--d': `${(0.15 + index * 0.05).toFixed(2)}s`,
                            } as React.CSSProperties
                          }
                        >
                          <span className="item-no">
                            {parts.refNumber}
                            <small>{parts.year}</small>
                          </span>
                          <span className="item-date">
                            {parts.monthDay}
                            <small>{parts.weekday}</small>
                          </span>
                          <span className="item-main">
                            <span className="item-title">{item.title}</span>
                            {item.summary ? (
                              <span className="item-sum">{item.summary}</span>
                            ) : null}
                          </span>
                          <span aria-hidden="true" className="item-arrow">
                            →
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {/* 分页栏 */}
        {outcome.data.totalPages > 1 ? (
          <nav aria-label="新闻分页" className="news-pagination">
            {outcome.data.page > 1 ? (
              <Link
                href={buildPaginationHref(
                  outcome.data.page - 1,
                  activeYear !== 'all' ? activeYear : undefined,
                )}
                rel="prev"
              >
                上一页
              </Link>
            ) : (
              <span aria-disabled="true">上一页</span>
            )}
            <span aria-current="page">
              第 {outcome.data.page} 卷，共 {outcome.data.totalPages} 卷
            </span>
            {outcome.data.hasNextPage ? (
              <Link
                href={buildPaginationHref(
                  outcome.data.page + 1,
                  activeYear !== 'all' ? activeYear : undefined,
                )}
                rel="next"
              >
                下一页
              </Link>
            ) : (
              <span aria-disabled="true">下一页</span>
            )}
          </nav>
        ) : null}

        <footer className="colophon">
          <span>PORTAL NEWS ARCHIVE — 示例协会</span>
          <span>最新动态 · 往期回顾</span>
        </footer>
      </div>
    </main>
  )
}

async function loadPage(page: number) {
  try {
    return { data: await getPublicNewsPage(page), error: undefined }
  } catch (error) {
    if (!(error instanceof NewsUnavailableError)) throw error
    return { data: undefined, error }
  }
}

function normalizePage(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function normalizeYear(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value === 'all') return 'all'
  return /^\d{4}$/.test(value) ? value : undefined
}

function pad2(number_: number): string {
  return String(number_).padStart(2, '0')
}

interface ZonedDateParts {
  day: string
  month: string
  monthDay: string
  refNumber: string
  weekday: string
  year: string
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
    refNumber: `${month}${day}`,
    weekday,
    year,
  }
}

function buildFilterHref(page: number, year: string): string {
  const parameters = new URLSearchParams()
  if (page > 1) parameters.set('page', String(page))
  if (year !== 'all') parameters.set('year', year)
  const query = parameters.toString()
  return query ? `/news?${query}` : '/news'
}

function buildPaginationHref(page: number, year?: string): string {
  const parameters = new URLSearchParams()
  if (page > 1) parameters.set('page', String(page))
  if (year && year !== 'all') parameters.set('year', year)
  const query = parameters.toString()
  return query ? `/news?${query}` : '/news'
}
