import type { Metadata } from 'next'
import Link from 'next/link'

import {
  GalleryUnavailableError,
  getPublicGalleryPage,
} from '../../server/gallery'

import { GalleryStatusPanel } from './GalleryStatusPanel'

export const metadata: Metadata = {
  description: '浏览示例协会成员发布的摄影作品。',
  title: '协会作品',
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const requestedPage = normalizePage((await searchParams).page)
  const outcome = await loadPage(requestedPage)

  return (
    <main className="gallery-shell" id="main-content">
      <header className="gallery-heading">
        <p className="gallery-eyebrow">PORTAL · 协会门户</p>
        <h1>协会作品</h1>
        <p>在星空与校园之间，浏览协会成员分享的影像作品。</p>
      </header>

      {outcome.error ? (
        <GalleryStatusPanel
          description="画廊服务暂时无法连接，请稍后再试。"
          requestId={outcome.error.requestId}
          title="暂时无法载入作品"
        />
      ) : outcome.data.items.length === 0 ? (
        <GalleryStatusPanel
          description="作品发布后会显示在这里。"
          title="暂时没有公开作品"
        />
      ) : (
        <ol className="gallery-grid">
          {outcome.data.items.map((work) => (
            <li key={work.id}>
              <article className="gallery-card">
                <Link
                  aria-label={`查看作品：${work.title}`}
                  className="gallery-card-image-link"
                  href={`/gallery/${encodeURIComponent(work.slug)}`}
                >
                  {/* The origin already serves fixed, processed variants. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={work.image.alt}
                    decoding="async"
                    height={work.image.variants.list.height}
                    loading="lazy"
                    sizes="(max-width: 48rem) calc(100vw - 2rem), 40rem"
                    src={work.image.variants.thumbnail.path}
                    srcSet={`${work.image.variants.thumbnail.path} ${work.image.variants.thumbnail.width}w, ${work.image.variants.list.path} ${work.image.variants.list.width}w`}
                    width={work.image.variants.list.width}
                  />
                </Link>
                <div className="gallery-card-copy">
                  <time dateTime={work.publishedAt}>
                    {formatDate(work.publishedAt)}
                  </time>
                  <h2>
                    <Link href={`/gallery/${encodeURIComponent(work.slug)}`}>
                      {work.title}
                    </Link>
                  </h2>
                  <p className="gallery-author">作者：{work.authorName}</p>
                  {work.summary ? <p>{work.summary}</p> : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}

      {outcome.data && outcome.data.totalPages > 1 ? (
        <nav aria-label="作品分页" className="gallery-pagination">
          {outcome.data.page > 1 ? (
            <Link href={`/gallery?page=${outcome.data.page - 1}`} rel="prev">
              上一页
            </Link>
          ) : (
            <span aria-disabled="true">上一页</span>
          )}
          <span aria-current="page">
            第 {outcome.data.page} 页，共 {outcome.data.totalPages} 页
          </span>
          {outcome.data.hasNextPage ? (
            <Link href={`/gallery?page=${outcome.data.page + 1}`} rel="next">
              下一页
            </Link>
          ) : (
            <span aria-disabled="true">下一页</span>
          )}
        </nav>
      ) : null}

      <nav aria-label="返回入口" className="gallery-return-nav">
        <Link href="/">返回首页</Link>
      </nav>
    </main>
  )
}

async function loadPage(page: number) {
  try {
    return { data: await getPublicGalleryPage(page), error: undefined }
  } catch (error) {
    if (!(error instanceof GalleryUnavailableError)) throw error
    return { data: undefined, error }
  }
}

function normalizePage(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'long',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value))
}
