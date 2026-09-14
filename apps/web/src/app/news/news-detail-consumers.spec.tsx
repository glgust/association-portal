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

import NewsDetailPage, { generateMetadata } from './[slug]/page'
import NewsPage from './page'

function successResponse(slug: string): Response {
  return Response.json({
    body: {
      blocks: [
        {
          children: [{ text: '虚构消费者正文', type: 'text' }],
          type: 'paragraph',
        },
      ],
      version: 1,
    },
    id: '683a487b-292b-4190-aad2-06f6b95836f5',
    publishedAt: '2026-07-19T10:00:00+08:00',
    slug,
    summary: '虚构消费者摘要',
    title: '虚构消费者新闻',
  })
}

describe('News detail page consumers', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
    notFoundMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('shares one successful CMS read between metadata and body', async () => {
    const slug = 'news-consumer-success'
    const fetchMock = vi.fn().mockResolvedValue(successResponse(slug))
    vi.stubGlobal('fetch', fetchMock)
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug }),
    })
    const page = await NewsDetailPage({ params: Promise.resolve({ slug }) })
    const html = renderToStaticMarkup(page)
    expect(metadata).toMatchObject({
      description: '虚构消费者摘要',
      title: '虚构消费者新闻',
    })
    expect(html).toContain('虚构消费者新闻')
    expect(html).toContain('虚构消费者正文')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shares one not-found outcome between metadata and body', async () => {
    const slug = 'news-consumer-not-found'
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'NOT_FOUND',
          message: 'News not found',
          requestId: 'fictional-not-found-request',
        },
        { status: 404 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(
      (await generateMetadata({ params: Promise.resolve({ slug }) })).title,
    ).toBe('新闻不存在')
    await expect(
      NewsDetailPage({ params: Promise.resolve({ slug }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shares one unavailable outcome between metadata and body', async () => {
    const slug = 'news-consumer-unavailable'
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'INTERNAL_ERROR',
          message: 'News unavailable',
          requestId: 'fictional-unavailable-request',
        },
        { status: 500 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(
      (await generateMetadata({ params: Promise.resolve({ slug }) })).title,
    ).toBe('新闻详情暂不可用')
    const html = renderToStaticMarkup(
      await NewsDetailPage({ params: Promise.resolve({ slug }) }),
    )
    expect(html).toContain('暂时无法载入新闻')
    expect(html).toContain('fictional-unavailable-request')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('News list page consumers in detail suite', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('renders archive masthead, month group, and derived archive ref for news items', async () => {
    const mockItems = [
      {
        id: '683a487b-292b-4190-aad2-06f6b95836f5',
        publishedAt: '2026-07-19T10:00:00+08:00',
        slug: 'first-archive-news',
        summary: '这是第一条虚构测试摘要',
        title: '英仙座流星雨观测记录',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        hasNextPage: false,
        items: mockItems,
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const page = await NewsPage({
      searchParams: Promise.resolve({ page: '1' }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('NEWS')
    expect(html).toContain('ARCHIVE')
    expect(html).toContain('英仙座流星雨观测记录')
    expect(html).toContain('这是第一条虚构测试摘要')
    expect(html).toContain('/news/first-archive-news')
    expect(html).toContain('0719')
    expect(html).toContain('2026')
    expect(html).toContain('07.19')
    expect(html).toContain('周日')
  })

  it('renders pagination links when totalPages > 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        hasNextPage: true,
        items: [
          {
            id: '683a487b-292b-4190-aad2-06f6b95836f5',
            publishedAt: '2026-07-19T10:00:00+08:00',
            slug: 'news-page-1',
            summary: '摘要 1',
            title: '测试新闻 1',
          },
        ],
        page: 1,
        pageSize: 10,
        totalItems: 15,
        totalPages: 2,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const page = await NewsPage({
      searchParams: Promise.resolve({ page: '1' }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('第 1 卷，共 2 卷')
    expect(html).toContain('下一页')
  })

  it('renders empty notice when no news items exist', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        hasNextPage: false,
        items: [],
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const page = await NewsPage({
      searchParams: Promise.resolve({ page: '1' }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('暂时没有公开新闻')
  })

  it('renders unavailable panel with requestId when list service fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'INTERNAL_ERROR',
          message: 'News unavailable',
          requestId: 'fictional-list-error-request',
        },
        { status: 500 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const page = await NewsPage({
      searchParams: Promise.resolve({ page: '1' }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('暂时无法载入新闻')
    expect(html).toContain('fictional-list-error-request')
  })
})
