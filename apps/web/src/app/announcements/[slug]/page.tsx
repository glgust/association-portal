import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  AnnouncementNotFoundError,
  loadPublicAnnouncementDetail,
} from '@/server/announcements'

import { StatusPanel } from '../StatusPanel'
import { AnnouncementBody } from '../AnnouncementBody'
import { AnnouncementSpectrumAxis } from '../AnnouncementSpectrum'

export default async function AnnouncementLink({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { data, error } = await loadPublicAnnouncementDetail(slug)
  if (error) {
    if (error instanceof AnnouncementNotFoundError) notFound()
    return (
      <main
        className="announcement-surface announcement-wrap"
        id="main-content"
      >
        <StatusPanel
          description="请稍后刷新重试。"
          requestId={error.requestId}
          title="暂时无法载入公告"
        />
      </main>
    )
  }
  return (
    <main className="announcement-surface" id="main-content">
      <header className="announcement-wrap announcement-detail-heading">
        <Link href="/announcements">← 返回公告列表</Link>
        <h1>{data.title}</h1>
        <time dateTime={data.publishedAt}>
          {new Intl.DateTimeFormat('zh-CN', {
            dateStyle: 'long',
            timeZone: 'Asia/Shanghai',
          }).format(new Date(data.publishedAt))}
        </time>
        {data.summary ? <p>{data.summary}</p> : null}
      </header>
      <AnnouncementSpectrumAxis />
      <div className="announcement-wrap announcement-detail-content">
        <AnnouncementBody body={data.body} />
      </div>
    </main>
  )
}
