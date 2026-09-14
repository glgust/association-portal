import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error The CMS Vitest runner supplies the shared test dependency.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import GalleryPage from './page'

const item = {
  authorName: '虚构观星者',
  id: '5de0f5dc-74e0-4f9b-9cc7-33241fdab80f',
  image: {
    alt: '虚构星云测试图',
    height: 1200,
    variants: Object.fromEntries(
      [
        ['detail', 1800, 1200],
        ['display', 1800, 1200],
        ['list', 1280, 853],
        ['thumbnail', 640, 427],
      ].map(([variant, width, height]) => [
        variant,
        {
          height,
          path: `/api/v1/content/gallery/fictional-nebula/image/${variant}`,
          width,
        },
      ]),
    ),
    width: 1800,
  },
  publishedAt: '2026-08-26T20:00:00+08:00',
  slug: 'fictional-nebula',
  summary: '仅用于自动化的虚构作品。',
  title: '虚构星云',
}

describe('Gallery list consumers', () => {
  beforeEach(() => vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201'))

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('renders strict results, responsive same-origin images, and pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        hasNextPage: true,
        items: [item],
        page: 1,
        pageSize: 10,
        totalItems: 11,
        totalPages: 2,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const html = renderToStaticMarkup(
      await GalleryPage({ searchParams: Promise.resolve({ page: '1' }) }),
    )
    expect(html).toContain('虚构星云')
    expect(html).toContain('作者：虚构观星者')
    expect(html).toContain('/media/gallery/fictional-nebula/image/thumbnail')
    expect(html).toContain('/gallery?page=2')
    expect(html).not.toContain('/api/v1/content/gallery')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3201/api/v1/content/gallery?page=1&amp;pageSize=10'.replace(
        '&amp;',
        '&',
      ),
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('renders the empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          hasNextPage: false,
          items: [],
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
        }),
      ),
    )
    const html = renderToStaticMarkup(
      await GalleryPage({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('暂时没有公开作品')
  })

  it('treats list 404 as unavailable and preserves requestId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            code: 'NOT_FOUND',
            message: 'No list',
            requestId: 'fictional-list-unavailable',
          },
          { status: 404 },
        ),
      ),
    )
    const html = renderToStaticMarkup(
      await GalleryPage({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('暂时无法载入作品')
    expect(html).toContain('fictional-list-unavailable')
  })
})
