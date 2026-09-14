import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  GalleryNotFoundError,
  loadPublicGalleryDetail,
} from '../../../server/gallery'

import { GalleryStatusPanel } from '../GalleryStatusPanel'

const siteDescription = '浏览示例协会成员发布的摄影作品。'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const outcome = await loadPublicGalleryDetail(slug)
  if (outcome.data) {
    return {
      description: outcome.data.summary ?? siteDescription,
      openGraph: {
        description: outcome.data.summary ?? siteDescription,
        title: outcome.data.title,
        type: 'article',
      },
      title: outcome.data.title,
    }
  }
  return {
    description: siteDescription,
    robots: { index: false },
    title:
      outcome.error instanceof GalleryNotFoundError
        ? '作品不存在'
        : '作品详情暂不可用',
  }
}

export default async function GalleryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const outcome = await loadPublicGalleryDetail(slug)
  if (outcome.error instanceof GalleryNotFoundError) notFound()
  if (outcome.error) {
    return (
      <main className="gallery-shell gallery-detail-shell" id="main-content">
        <header className="gallery-heading">
          <p className="gallery-eyebrow">PORTAL · 协会门户</p>
          <h1>作品详情</h1>
        </header>
        <GalleryStatusPanel
          description="画廊服务暂时无法连接，请稍后再试。"
          requestId={outcome.error.requestId}
          title="暂时无法载入作品"
        />
      </main>
    )
  }

  const work = outcome.data
  return (
    <main className="gallery-shell gallery-detail-shell" id="main-content">
      <nav aria-label="面包屑" className="gallery-breadcrumbs">
        <Link href="/gallery">协会作品</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">详情</span>
      </nav>
      <article className="gallery-work">
        <header className="gallery-work-heading">
          <p className="gallery-eyebrow">摄影作品</p>
          <h1>{work.title}</h1>
          <p className="gallery-author">作者：{work.authorName}</p>
          <time dateTime={work.publishedAt}>
            发布于 {formatDate(work.publishedAt)}
          </time>
        </header>
        <figure className="gallery-figure">
          {/* The origin already serves fixed, processed variants. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={work.image.alt}
            decoding="async"
            height={work.image.variants.display.height}
            sizes="(max-width: 80rem) calc(100vw - 2rem), 76rem"
            src={work.image.variants.detail.path}
            srcSet={`${work.image.variants.list.path} ${work.image.variants.list.width}w, ${work.image.variants.detail.path} ${work.image.variants.detail.width}w, ${work.image.variants.display.path} ${work.image.variants.display.width}w`}
            width={work.image.variants.display.width}
          />
          {work.summary ? <figcaption>{work.summary}</figcaption> : null}
        </figure>
      </article>
      <nav aria-label="返回作品列表" className="gallery-return-nav">
        <Link href="/gallery">返回作品列表</Link>
      </nav>
    </main>
  )
}

function formatDate(value: string): string {
  return `${new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value))}（中国标准时间）`
}
