import type { Metadata } from 'next'

import {
  AnnouncementUnavailableError,
  getPublicAnnouncementPage,
} from '@/server/announcements'

import { AnnouncementArchive } from './AnnouncementArchive'
import { AnnouncementSpectrumAxis } from './AnnouncementSpectrum'

export const metadata: Metadata = {
  description: '查看示例协会发布的最新公告。',
  title: '公告',
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    open?: string | string[]
    page?: string | string[]
  }>
}) {
  const parameters = await searchParams
  const requestedPage = normalisePage(parameters.page)
  const initialOpenSlug =
    typeof parameters.open === 'string' ? parameters.open : undefined
  const outcome = await loadPage(requestedPage)
  const count = outcome.data
    ? String(outcome.data.totalItems).padStart(2, '0')
    : '—'

  return (
    <div className="announcement-surface">
      <header className="announcement-mast">
        <div className="announcement-wrap announcement-mast-title">
          <h1>公告</h1>
          <div className="announcement-mast-side">
            <span aria-hidden="true" />
            <p>
              协会全部公开通知，按发布时间倒序排列。点击任意条目可在原地展开阅读全文。
            </p>
            <p className="announcement-count">
              通告总数 <strong>{count}</strong>
            </p>
          </div>
        </div>
      </header>

      <AnnouncementSpectrumAxis />

      <main className="announcement-wrap" id="main-content">
        {outcome.error ? (
          <AnnouncementState
            description="请稍后刷新重试。"
            requestId={outcome.error.requestId}
            title="暂时无法载入公告"
          />
        ) : outcome.data.items.length === 0 ? (
          <AnnouncementState
            description="新的通知发布后会出现在这里。"
            title="暂无公开公告"
          />
        ) : (
          <AnnouncementArchive
            initialOpenSlug={initialOpenSlug}
            page={outcome.data}
          />
        )}
      </main>

      <footer className="announcement-wrap announcement-footer">
        <span>PORTAL 协会门户</span>
        <span>公告 · 公开档案</span>
      </footer>
    </div>
  )
}

function AnnouncementState({
  description,
  requestId,
  title,
}: {
  description: string
  requestId?: string
  title: string
}) {
  return (
    <div className="announcement-layout announcement-layout-state">
      <div className="announcement-content">
        <section className="announcement-state" role="status">
          <span>——</span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
            {requestId ? <p>请求编号：{requestId}</p> : null}
          </div>
        </section>
      </div>
    </div>
  )
}

async function loadPage(page: number): Promise<
  | {
      data: Awaited<ReturnType<typeof getPublicAnnouncementPage>>
      error?: never
    }
  | { data?: never; error: AnnouncementUnavailableError }
> {
  try {
    return { data: await getPublicAnnouncementPage(page) }
  } catch (error) {
    if (!(error instanceof AnnouncementUnavailableError)) throw error
    return { error }
  }
}

function normalisePage(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}
