import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error The CMS Vitest runner supplies the shared test dependency.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(
  'react',
  async (importOriginal: () => Promise<typeof import('react')>) => {
    const original = await importOriginal()
    return {
      ...original,
      cache: <Arguments extends unknown[], Result>(
        loader: (...arguments_: Arguments) => Result,
      ) => {
        const results = new Map<string, Result>()
        return (...arguments_: Arguments): Result => {
          const key = JSON.stringify(arguments_)
          const existing = results.get(key)
          if (existing !== undefined) return existing
          const result = loader(...arguments_)
          results.set(key, result)
          return result
        }
      },
    }
  },
)

vi.mock('next/navigation', () => ({ notFound: notFoundMock }))

import GalleryDetailPage, { generateMetadata } from './[slug]/page'

function successResponse(slug: string): Response {
  const imagePath = (variant: string) =>
    `/api/v1/content/gallery/${slug}/image/${variant}`
  return Response.json({
    authorName: '虚构观星者',
    id: '5de0f5dc-74e0-4f9b-9cc7-33241fdab80f',
    image: {
      alt: '虚构星云测试图',
      height: 1200,
      variants: {
        detail: { height: 1200, path: imagePath('detail'), width: 1800 },
        display: { height: 1200, path: imagePath('display'), width: 1800 },
        list: { height: 853, path: imagePath('list'), width: 1280 },
        thumbnail: {
          height: 427,
          path: imagePath('thumbnail'),
          width: 640,
        },
      },
      width: 1800,
    },
    publishedAt: '2026-08-26T20:00:00+08:00',
    slug,
    summary: '仅用于自动化的虚构作品。',
    title: '虚构星云',
  })
}

describe('Gallery detail consumers', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
    notFoundMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('shares one strict read and renders only same-origin responsive images', async () => {
    const slug = 'fictional-nebula-success'
    const fetchMock = vi.fn().mockResolvedValue(successResponse(slug))
    vi.stubGlobal('fetch', fetchMock)

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug }),
    })
    const html = renderToStaticMarkup(
      await GalleryDetailPage({ params: Promise.resolve({ slug }) }),
    )

    expect(metadata).toMatchObject({
      description: '仅用于自动化的虚构作品。',
      title: '虚构星云',
    })
    expect(html).toContain('作者：虚构观星者')
    expect(html).toContain('alt="虚构星云测试图"')
    expect(html).toContain(`/media/gallery/${slug}/image/list`)
    expect(html).not.toContain('/api/v1/content/gallery')
    expect(html).not.toContain('objectKey')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:3201/api/v1/content/gallery/${slug}`,
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('shares one controlled not-found outcome', async () => {
    const slug = 'fictional-nebula-not-found'
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'NOT_FOUND',
          message: 'Gallery work not found',
          requestId: 'fictional-gallery-not-found',
        },
        { status: 404 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(
      (await generateMetadata({ params: Promise.resolve({ slug }) })).title,
    ).toBe('作品不存在')
    await expect(
      GalleryDetailPage({ params: Promise.resolve({ slug }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows requestId for an unavailable or invalid upstream response', async () => {
    const slug = 'fictional-nebula-unavailable'
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Gallery unavailable',
          requestId: 'fictional-gallery-unavailable',
        },
        { status: 503 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(
      (await generateMetadata({ params: Promise.resolve({ slug }) })).title,
    ).toBe('作品详情暂不可用')
    const html = renderToStaticMarkup(
      await GalleryDetailPage({ params: Promise.resolve({ slug }) }),
    )
    expect(html).toContain('fictional-gallery-unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
