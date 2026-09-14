import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type {
  PublicActivityListItem,
  PublicActivityPage,
} from '@ascnucc/contracts'

import {
  ActivityUnavailableError,
  getPublicActivityPage,
} from '@/server/activities'

import { ActivityArchiveAtmosphere } from './ActivityArchiveAtmosphere'
import { ActivityStatus } from './ActivityStatus'
import { ActivityStatusPanel } from './ActivityStatusPanel'
import {
  formatZonedHM,
  formatZonedMD,
  formatZonedWeekday,
  formatZonedYMD,
  isSameZonedDay,
} from './activity-time'

export const metadata: Metadata = {
  description: '查看示例协会的近期活动、日常安排与往期回顾。',
  title: '活动目录',
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const requestedPage = normalisePage((await searchParams).page)
  const outcome = await loadPage(requestedPage)

  if (outcome.error) {
    return (
      <main className="activity-surface sb-shell" id="main-content">
        <ActivityArchiveAtmosphere ghostText="ERR" />
        <div className="view">
          <header className="masthead activity-page-heading">
            <div
              className="mast-meta anim-line"
              style={{ '--d': '0s' } as CSSProperties}
            >
              <span>PORTAL · ACTIVITY PROGRAM · 活动目录</span>
              <span>PAGE — ACTIVITIES</span>
            </div>
            <h1
              className="mast-title anim"
              style={{ '--d': '.12s' } as CSSProperties}
            >
              EVENTS<span className="slash"> / </span>
              <span className="outline">PROGRAM</span>
            </h1>
          </header>
          <ActivityStatusPanel
            description="活动服务暂时无法连接，请稍后再试。"
            requestId={outcome.error.requestId}
            title="暂时无法载入活动目录"
          />
        </div>
      </main>
    )
  }

  const result = outcome.data
  const current = result.items.filter(
    ({ status }) => status === 'ongoing' || status === 'upcoming',
  )
  const history = result.items.filter(
    ({ status }) => status === 'ended' || status === 'cancelled',
  )

  return (
    <main className="activity-surface sb-shell" id="main-content">
      <ActivityArchiveAtmosphere ghostText="UTC+8" />

      <div className="view">
        <header className="masthead activity-page-heading">
          <div
            className="mast-meta anim-line"
            style={{ '--d': '0s' } as CSSProperties}
          >
            <span>PORTAL · ACTIVITY PROGRAM · 活动目录</span>
            <span>PAGE — ACTIVITIES</span>
          </div>
          <h1
            className="mast-title anim"
            style={{ '--d': '.12s' } as CSSProperties}
          >
            EVENTS<span className="slash"> / </span>
            <span className="outline">PROGRAM</span>
          </h1>
          <div className="mast-lede">
            <p className="anim" style={{ '--d': '.3s' } as CSSProperties}>
              寻找下一次与星空相遇的机会。查看近期活动与日常安排，也重温我们一同走过的观测之夜。
            </p>
            <div
              className="mast-stats anim"
              style={{ '--d': '.4s' } as CSSProperties}
            >
              <span className="stat">
                <span className="num live">
                  {String(result.totalItems).padStart(2, '0')}
                </span>
                <span className="lab">收录总数</span>
              </span>
              <span className="stat">
                <span className="num">
                  {String(result.page).padStart(2, '0')}
                </span>
                <span className="lab">当前页码</span>
              </span>
              <span className="stat">
                <span className="num">
                  {String(result.items.length).padStart(2, '0')}
                </span>
                <span className="lab">本页记录</span>
              </span>
            </div>
          </div>
        </header>

        {result.items.length === 0 ? (
          <div className="empty anim" style={{ '--d': '.5s' } as CSSProperties}>
            <ActivityStatusPanel
              description="新活动发布后会显示在这里。"
              title="暂时没有公开活动"
            />
          </div>
        ) : (
          <>
            {current.length > 0 ? (
              <ActivitySection
                cap="NOW & NEXT / 当前与即将"
                items={current}
                page={result.page}
                pageSize={result.pageSize}
                startIndex={0}
                title="当前活动"
              />
            ) : null}
            {history.length > 0 ? (
              <ActivitySection
                cap="HISTORY / 历史档案"
                items={history}
                page={result.page}
                pageSize={result.pageSize}
                startIndex={current.length}
                title="往期与已取消活动"
              />
            ) : null}
          </>
        )}

        {result.totalPages > 1 ? (
          <nav aria-label="活动目录分页" className="activity-pagination">
            {result.page > 1 ? (
              <Link href={`/activities?page=${result.page - 1}`} rel="prev">
                ← 上一页
              </Link>
            ) : (
              <span aria-disabled="true">← 上一页</span>
            )}
            <span aria-current="page">
              第 {result.page} 页，共 {result.totalPages} 页
            </span>
            {result.hasNextPage ? (
              <Link href={`/activities?page=${result.page + 1}`} rel="next">
                下一页 →
              </Link>
            ) : (
              <span aria-disabled="true">下一页 →</span>
            )}
          </nav>
        ) : null}

        <footer className="colophon">
          <span>PORTAL · ACTIVITY PROGRAM · 示例协会</span>
          <span>相约星空 · 留下共同的观测记忆</span>
        </footer>
      </div>
    </main>
  )
}

function ActivitySection({
  cap,
  items,
  page,
  pageSize,
  startIndex,
  title,
}: {
  cap: string
  items: PublicActivityListItem[]
  page: number
  pageSize: number
  startIndex: number
  title: string
}) {
  return (
    <section aria-label={cap} className="sect activity-section">
      <div className="sect-head">
        <h2 className="t">
          {title} <span className="sect-cap-en">{cap}</span>
        </h2>
        <span className="n">{String(items.length).padStart(2, '0')} 项</span>
      </div>
      <ol className="activity-list">
        {items.map((activity, index) => {
          const itemOrder = (page - 1) * pageSize + (startIndex + index + 1)
          const year = getArchiveYear(activity)
          const tailNo = String(itemOrder).padStart(3, '0')
          const prefixNo = `EVT-${year}`
          const rowCls = `activity-card item anim ${
            activity.status === 'cancelled'
              ? 'is-cancelled'
              : activity.status === 'ended'
                ? 'is-ended'
                : ''
          }`

          return (
            <li key={activity.id}>
              <article
                className={rowCls}
                style={
                  {
                    '--d': `${(0.15 + (startIndex + index) * 0.05).toFixed(2)}s`,
                  } as CSSProperties
                }
              >
                <span className="item-no">
                  {tailNo}
                  <small>{prefixNo}</small>
                </span>

                <ActivityStatus status={activity.status} />

                <span className="item-when">
                  {activity.activityType === 'standing' ? (
                    <>
                      常驻
                      <small className="activity-multiline">
                        {activity.scheduleText}
                      </small>
                    </>
                  ) : (
                    <>
                      {formatWhenDate(activity.startsAt, activity.endsAt)}
                      <small>
                        {formatWhenTime(activity.startsAt, activity.endsAt)} ·{' '}
                        {formatZonedWeekday(activity.startsAt)}
                      </small>
                    </>
                  )}
                </span>

                <span className="item-main">
                  <h3 className="item-heading">
                    <Link
                      className="item-title"
                      href={`/activities/${activity.slug}`}
                    >
                      {activity.title}
                    </Link>
                  </h3>
                  {activity.summary ? (
                    <p className="item-sum activity-multiline">
                      {activity.summary}
                    </p>
                  ) : null}
                  {activity.status === 'cancelled' ? (
                    <p className="activity-card-cancellation activity-multiline">
                      取消说明：{activity.cancellationNote}
                    </p>
                  ) : null}
                </span>

                <span className="item-loc">{activity.location}</span>
              </article>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function getArchiveYear(activity: PublicActivityListItem): string {
  const targetDate =
    activity.activityType === 'temporary'
      ? activity.startsAt
      : activity.publishedAt
  const ymd = formatZonedYMD(targetDate)
  return ymd.split('.')[0] ?? '2026'
}

function formatWhenDate(startsAt: string, endsAt: string): string {
  const sMd = formatZonedMD(startsAt)
  const eMd = formatZonedMD(endsAt)
  return isSameZonedDay(startsAt, endsAt) ? sMd : `${sMd} – ${eMd}`
}

function formatWhenTime(startsAt: string, endsAt: string): string {
  return `${formatZonedHM(startsAt)} – ${formatZonedHM(endsAt)}`
}

async function loadPage(
  page: number,
): Promise<
  | { data: PublicActivityPage; error?: never }
  | { data?: never; error: ActivityUnavailableError }
> {
  try {
    return { data: await getPublicActivityPage(page) }
  } catch (error) {
    if (!(error instanceof ActivityUnavailableError)) throw error
    return { error }
  }
}

function normalisePage(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}
