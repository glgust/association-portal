import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import type { PublicActivityDetail } from '@ascnucc/contracts'

import { PublicRichText } from '@/components/content/PublicRichText'
import {
  ActivityNotFoundError,
  loadPublicActivityDetail,
} from '@/server/activities'

import { ActivityArchiveAtmosphere } from '../ActivityArchiveAtmosphere'
import { ActivityStatus } from '../ActivityStatus'
import { ActivityStatusPanel } from '../ActivityStatusPanel'
import {
  formatZonedFullDateTime,
  formatZonedHM,
  formatZonedMD,
  formatZonedWeekday,
  formatZonedYMD,
  isSameZonedDay,
} from '../activity-time'

const siteDescription = '查看示例协会活动的时间、地点与介绍。'

const statusLabels: Record<string, string> = {
  cancelled: '已取消',
  ended: '已结束',
  ongoing: '进行中',
  upcoming: '即将开始',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const outcome = await loadPublicActivityDetail(slug)
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
      outcome.error instanceof ActivityNotFoundError
        ? '活动不存在'
        : '活动详情暂不可用',
  }
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const outcome = await loadPublicActivityDetail(slug)

  if (outcome.error instanceof ActivityNotFoundError) notFound()
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
              <span>PAGE — DETAIL ERROR</span>
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
            title="暂时无法载入活动"
          />
        </div>
      </main>
    )
  }

  const activity = outcome.data
  const archiveYear = getArchiveYear(activity)
  const archiveNo = `EVT-${archiveYear}`
  const statusLabel = statusLabels[activity.status] ?? activity.status
  const ghostText =
    activity.activityType === 'temporary'
      ? formatZonedMD(activity.startsAt).replace('.', '·')
      : 'LIVE'

  return (
    <main className="activity-surface sb-shell" id="main-content">
      <ActivityArchiveAtmosphere ghostText={ghostText} veilText={archiveNo} />

      <article className="view" aria-label={activity.title}>
        <div className="back-row">
          <nav aria-label="面包屑" className="activity-breadcrumbs">
            <Link
              className="back-link anim"
              href="/activities"
              style={{ '--d': '0s' } as CSSProperties}
            >
              返回活动目录
            </Link>
            <span className="activity-visually-hidden">/ 详情</span>
          </nav>
          <span
            className="back-no anim"
            style={{ '--d': '.05s' } as CSSProperties}
          >
            {archiveNo}
          </span>
        </div>

        <div
          className="art-meta anim"
          style={{ '--d': '.12s' } as CSSProperties}
        >
          <div className="cell">
            <span className="k">档案 / REF</span>
            <span className="v big">{archiveNo}</span>
          </div>
          <div className="cell">
            <span className="k">状态 / STATUS</span>
            <span className="v">
              <ActivityStatus status={activity.status} />
            </span>
          </div>
          <div className="cell">
            <span className="k">时间 / TIME</span>
            <span className="v">
              {activity.activityType === 'standing'
                ? '常驻活动'
                : `${formatZonedYMD(activity.startsAt)}${
                    isSameZonedDay(activity.startsAt, activity.endsAt)
                      ? ''
                      : ' 起'
                  }`}
            </span>
          </div>
          <div className="cell">
            <span className="k">地点 / LOCATION</span>
            <span className="v">{activity.location}</span>
          </div>
          <div className="cell">
            <span className="k">发布 / PUBLISHED</span>
            <span className="v">{formatZonedYMD(activity.publishedAt)}</span>
          </div>
        </div>

        <header className="art-head activity-article-heading">
          <p
            className="art-kicker anim"
            style={{ '--d': '.2s' } as CSSProperties}
          >
            {statusLabel} · ACTIVITY PROGRAM
          </p>
          <h1
            className={`art-title anim ${
              activity.status === 'cancelled' ? 'cancelled' : ''
            }`}
            style={{ '--d': '.28s' } as CSSProperties}
          >
            {activity.title}
          </h1>
          {activity.summary ? (
            <p
              className="art-lede activity-multiline anim"
              style={{ '--d': '.38s' } as CSSProperties}
            >
              {activity.summary}
            </p>
          ) : null}
        </header>

        {activity.status === 'cancelled' && activity.cancellationNote ? (
          <section
            aria-labelledby="activity-cancelled"
            className="cancel-band activity-cancellation anim"
            style={{ '--d': '.4s' } as CSSProperties}
          >
            <h2 className="activity-visually-hidden" id="activity-cancelled">
              活动已取消
            </h2>
            <span className="k">取消说明 / CANCELLED</span>
            <p className="x activity-multiline">{activity.cancellationNote}</p>
          </section>
        ) : null}

        {/* 大时间版式：活动切片无图片字段，用超大日期/时刻排版作视觉抓手 */}
        <TimeHero activity={activity} />

        {/* 契约事实表：保持对既有 E2E 选择器 .activity-facts 的可观察性 */}
        <section
          aria-labelledby="activity-arrangement"
          className="activity-facts anim"
          style={{ '--d': '.46s' } as CSSProperties}
        >
          <h2 id="activity-arrangement" className="activity-visually-hidden">
            活动安排
          </h2>
          <dl>
            {activity.activityType === 'temporary' ? (
              <>
                <div className="fact-item">
                  <dt>开始时间</dt>
                  <dd>
                    <time dateTime={activity.startsAt}>
                      {formatZonedFullDateTime(activity.startsAt)}
                    </time>
                  </dd>
                </div>
                <div className="fact-item">
                  <dt>结束时间</dt>
                  <dd>
                    <time dateTime={activity.endsAt}>
                      {formatZonedFullDateTime(activity.endsAt)}
                    </time>
                  </dd>
                </div>
              </>
            ) : (
              <div className="fact-item">
                <dt>开放时间</dt>
                <dd className="activity-multiline">{activity.scheduleText}</dd>
              </div>
            )}
            <div className="fact-item">
              <dt>地点</dt>
              <dd>{activity.location}</dd>
            </div>
          </dl>
        </section>

        <div className="art-body activity-body">
          <div className="art-rail" aria-hidden="true">
            <span>RECORD · {archiveNo}</span>
          </div>
          <div className="art-text">
            <h2 className="activity-visually-hidden" id="activity-introduction">
              活动介绍
            </h2>
            <PublicRichText body={activity.body} />
          </div>
        </div>

        <nav aria-label="活动导航" className="art-nav activity-return-nav">
          <Link href="/activities">
            <span className="k">← 返回 / CATALOGUE</span>
            <span className="t">返回活动目录</span>
          </Link>
          <a href="#site-top">
            <span className="k">顶部 / TOP OF PAGE →</span>
            <span className="t">回到页面顶部</span>
          </a>
        </nav>

        <footer className="colophon">
          <span>PORTAL · ACTIVITY PROGRAM · 示例协会</span>
          <span>
            {archiveNo} · {statusLabel}
          </span>
        </footer>
      </article>
    </main>
  )
}

function TimeHero({ activity }: { activity: PublicActivityDetail }) {
  if (activity.activityType === 'standing') {
    const standingStatusDesc =
      activity.status === 'cancelled' ? '已取消' : '长期进行'

    return (
      <div
        className="time-hero anim"
        style={{ '--d': '.42s' } as CSSProperties}
      >
        <p className="sched activity-multiline">{activity.scheduleText}</p>
        <div className="sub">
          <div className="t1">常驻活动</div>
          <div className="t2">
            STANDING · {standingStatusDesc} · Asia/Shanghai (UTC+8)
          </div>
        </div>
      </div>
    )
  }

  const s = activity.startsAt
  const e = activity.endsAt
  const sameDay = isSameZonedDay(s, e)
  const big = sameDay
    ? formatZonedMD(s)
    : `${formatZonedMD(s)} – ${formatZonedMD(e)}`
  const t1 = `${formatZonedHM(s)} – ${formatZonedHM(e)}`
  const year = formatZonedYMD(s).split('.')[0] ?? '2026'
  const t2 = `${year} · ${formatZonedWeekday(s)}${
    sameDay ? '' : ' 起'
  } · Asia/Shanghai (UTC+8)`

  return (
    <div className="time-hero anim" style={{ '--d': '.42s' } as CSSProperties}>
      <div className="big">{big}</div>
      <div className="sub">
        <div className="t1">{t1}</div>
        <div className="t2">{t2}</div>
      </div>
    </div>
  )
}

function getArchiveYear(activity: PublicActivityDetail): string {
  const targetDate =
    activity.activityType === 'temporary'
      ? activity.startsAt
      : activity.publishedAt
  const ymd = formatZonedYMD(targetDate)
  return ymd.split('.')[0] ?? '2026'
}
