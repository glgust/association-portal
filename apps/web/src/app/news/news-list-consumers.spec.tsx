import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error The CMS Vitest runner supplies the shared test dependency.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import NewsPage from './page'

function pageResponse({
  hasNextPage = false,
  items = [],
  page = 1,
  pageSize = 10,
  totalItems = 0,
  totalPages = 1,
}: {
  hasNextPage?: boolean
  items?: Array<{
    id: string
    publishedAt: string
    slug: string
    summary: string | null
    title: string
  }>
  page?: number
  pageSize?: number
  totalItems?: number
  totalPages?: number
}): Response {
  return Response.json({
    hasNextPage,
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
  })
}

describe('News list page consumers', () => {
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
      pageResponse({
        items: mockItems,
        page: 1,
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
    expect(html).toContain('记录协会的每一步，也珍藏共同仰望的时刻。')
    expect(html).not.toContain('展示档案号由发布年份与年内序号推导')
    expect(html).not.toContain('档案号由年份与发布日期确定性推导')
    expect(html).toContain('英仙座流星雨观测记录')
    expect(html).toContain('这是第一条虚构测试摘要')
    expect(html).toContain('/news/first-archive-news')
    // Check derived archive number 0719 and 2026
    expect(html).toContain('0719')
    expect(html).toContain('2026')
    expect(html).toContain('07.19')
    expect(html).toContain('周日')
  })

  it('renders pagination links when totalPages > 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      pageResponse({
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
      pageResponse({
        items: [],
        page: 1,
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

  it('renders unavailable panel with requestId when service fails', async () => {
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

  // R1 B2 定向测试
  it('preserves requestedYear=2026 when current volume only has 2025 items without silent reset', async () => {
    const items2025 = [
      {
        id: '683a487b-292b-4190-aad2-06f6b95836f5',
        publishedAt: '2025-12-20T10:00:00+08:00',
        slug: 'news-2025-item',
        summary: '2025 年新闻摘要',
        title: '2025 年往期新闻标题',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      pageResponse({
        hasNextPage: true,
        items: items2025,
        page: 2,
        totalItems: 20,
        totalPages: 3,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const page = await NewsPage({
      searchParams: Promise.resolve({ page: '2', year: '2026' }),
    })
    const html = renderToStaticMarkup(page)

    // 不静默回退全部：不显示 2025 年条目
    expect(html).not.toContain('2025 年往期新闻标题')
    // 显示当前卷无匹配提示
    expect(html).toContain('该年份在当前卷暂无收录记录')
    // 筛选栏中 2026 保持选中状态
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('>2026<')
    // 分页链接保持透传 year=2026
    expect(html).toContain('year=2026')
  })

  it('filters items correctly when matching year is present in current volume', async () => {
    const mixedItems = [
      {
        id: '111a487b-292b-4190-aad2-06f6b95836f1',
        publishedAt: '2026-08-14T10:00:00+08:00',
        slug: 'news-2026',
        summary: '2026 摘要',
        title: '2026 年新闻标题',
      },
      {
        id: '222a487b-292b-4190-aad2-06f6b95836f2',
        publishedAt: '2025-10-01T10:00:00+08:00',
        slug: 'news-2025',
        summary: '2025 摘要',
        title: '2025 年旧新闻标题',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      pageResponse({
        items: mixedItems,
        page: 1,
        totalItems: 2,
        totalPages: 1,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const page = await NewsPage({
      searchParams: Promise.resolve({ page: '1', year: '2026' }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('2026 年新闻标题')
    expect(html).not.toContain('2025 年旧新闻标题')
  })

  it('gracefully falls back to all items when year is all or invalid', async () => {
    const items = [
      {
        id: '111a487b-292b-4190-aad2-06f6b95836f1',
        publishedAt: '2026-08-14T10:00:00+08:00',
        slug: 'news-item-1',
        summary: null,
        title: '测试新闻项',
      },
    ]

    const fetchMock = vi.fn().mockImplementation(() =>
      pageResponse({
        items,
        page: 1,
        totalItems: 1,
        totalPages: 1,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    // 测试非法年份参数，如 year=invalid
    const pageWithInvalidYear = await NewsPage({
      searchParams: Promise.resolve({ page: '1', year: 'invalid-year' }),
    })
    const htmlInvalid = renderToStaticMarkup(pageWithInvalidYear)
    expect(htmlInvalid).toContain('测试新闻项')
    expect(htmlInvalid).toContain('全部')

    // 测试显式 year=all
    const pageWithAll = await NewsPage({
      searchParams: Promise.resolve({ page: '1', year: 'all' }),
    })
    const htmlAll = renderToStaticMarkup(pageWithAll)
    expect(htmlAll).toContain('测试新闻项')
  })
})
