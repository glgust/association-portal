import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error R2 reuses the CMS Vitest runner without adding a Web dependency.
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

import ActivityDetailPage, { generateMetadata } from './[slug]/page'
import ActivitiesPage, { metadata as listMetadata } from './page'

const slugPrefix = 'consumer-detail'

function successResponse(slug: string): Response {
  return Response.json({
    activityType: 'standing',
    body: {
      blocks: [
        {
          children: [{ text: '虚构消费者正文', type: 'text' }],
          type: 'paragraph',
        },
      ],
      version: 1,
    },
    cancellationNote: null,
    id: 'd73efdb3-bd2c-4ccd-a900-50e997fc1094',
    location: '虚构消费者地点',
    publishedAt: '2026-07-18T08:00:00+08:00',
    scheduleText: '每周五',
    slug,
    status: 'ongoing',
    summary: '虚构消费者摘要',
    title: '虚构消费者活动',
    version: 1,
  })
}

function cancelledStandingResponse(slug: string): Response {
  return Response.json({
    activityType: 'standing',
    body: {
      blocks: [
        {
          children: [{ text: '常驻取消活动正文', type: 'text' }],
          type: 'paragraph',
        },
      ],
      version: 1,
    },
    cancellationNote: '因场地维修暂停开放。',
    id: 'e84efdb3-bd2c-4ccd-a900-50e997fc1095',
    location: '虚构常驻活动地点',
    publishedAt: '2026-07-18T08:00:00+08:00',
    scheduleText: '每周日 14:00–17:00',
    slug,
    status: 'cancelled',
    summary: '虚构常驻取消摘要',
    title: '虚构常驻取消活动',
    version: 1,
  })
}

function sampleListResponse() {
  return Response.json({
    asOf: '2026-09-04T12:00:00+08:00',
    hasNextPage: true,
    items: [
      {
        activityType: 'standing',
        cancellationNote: null,
        id: '11111111-1111-4111-8111-111111111111',
        location: '天台观测场',
        publishedAt: '2026-03-01T12:00:00+08:00',
        scheduleText: '每周五 19:30–22:00',
        slug: 'weekly-obs',
        status: 'ongoing',
        summary: '常驻观测活动摘要第一行\n常驻观测活动摘要第二行',
        title: '每周例行观测',
        version: 1,
      },
      {
        activityType: 'temporary',
        cancellationNote: null,
        endsAt: '2026-09-23T22:30:00+08:00',
        id: '22222222-2222-4222-8222-222222222222',
        location: '理科楼报告厅',
        publishedAt: '2026-09-01T10:00:00+08:00',
        slug: 'autumn-party',
        startsAt: '2026-09-23T19:00:00+08:00',
        status: 'upcoming',
        summary: '秋分观测夜摘要',
        title: '秋分星空开放夜',
        version: 1,
      },
      {
        activityType: 'temporary',
        cancellationNote: null,
        endsAt: '2026-08-13T04:00:00+08:00',
        id: '33333333-3333-4333-8333-333333333333',
        location: '暗空点',
        publishedAt: '2026-08-01T10:00:00+08:00',
        slug: 'perseids-2026',
        startsAt: '2026-08-12T21:00:00+08:00',
        status: 'ended',
        summary: '流星雨联合观测',
        title: '英仙座流星雨观测',
        version: 1,
      },
      {
        activityType: 'temporary',
        cancellationNote: '因天气原因取消。',
        endsAt: '2026-03-03T23:00:00+08:00',
        id: '44444444-4444-4444-8444-444444444444',
        location: '七层天台',
        publishedAt: '2026-02-24T10:00:00+08:00',
        slug: 'eclipse-2026',
        startsAt: '2026-03-03T20:00:00+08:00',
        status: 'cancelled',
        summary: '月全食现场观测',
        title: '月全食现场集中观测',
        version: 1,
      },
    ],
    page: 1,
    pageSize: 10,
    totalItems: 14,
    totalPages: 2,
  })
}

describe('activity detail page consumers', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
    notFoundMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('shares one successful CMS detail read between metadata and body', async () => {
    const slug = `${slugPrefix}-success`
    const fetchMock = vi.fn().mockResolvedValue(successResponse(slug))
    vi.stubGlobal('fetch', fetchMock)

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug }),
    })
    const page = await ActivityDetailPage({
      params: Promise.resolve({ slug }),
    })
    const html = renderToStaticMarkup(page)

    expect(metadata).toMatchObject({
      description: '虚构消费者摘要',
      title: '虚构消费者活动',
    })
    expect(html).toContain('虚构消费者活动')
    expect(html).toContain('虚构消费者正文')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:3201/api/v1/content/activities/${slug}`,
    )
  })

  it('shares one not-found outcome between metadata and body', async () => {
    const slug = `${slugPrefix}-not-found`
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'NOT_FOUND',
          message: 'Activity not found',
          requestId: 'fictional-not-found-request',
        },
        { status: 404 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug }),
    })
    await expect(
      ActivityDetailPage({ params: Promise.resolve({ slug }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(metadata.title).toBe('活动不存在')
    expect(notFoundMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shares one unavailable outcome between metadata and body', async () => {
    const slug = `${slugPrefix}-unavailable`
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'INTERNAL_ERROR',
          message: 'Activity unavailable',
          requestId: 'fictional-unavailable-request',
        },
        { status: 500 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug }),
    })
    const page = await ActivityDetailPage({
      params: Promise.resolve({ slug }),
    })
    const html = renderToStaticMarkup(page)

    expect(metadata.title).toBe('活动详情暂不可用')
    expect(html).toContain('暂时无法载入活动')
    expect(html).toContain('fictional-unavailable-request')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('renders standing ongoing activity with 长期进行 text and schedule', async () => {
    const slug = `${slugPrefix}-standing-ongoing`
    const fetchMock = vi.fn().mockResolvedValue(successResponse(slug))
    vi.stubGlobal('fetch', fetchMock)

    const page = await ActivityDetailPage({
      params: Promise.resolve({ slug }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('常驻活动')
    expect(html).toContain('STANDING · 长期进行 · Asia/Shanghai (UTC+8)')
    expect(html).toContain('每周五')
    expect(html).not.toContain('STANDING · 已取消')
  })

  it('renders standing cancelled activity with cancellation band and does not claim 长期进行', async () => {
    const slug = `${slugPrefix}-standing-cancelled`
    const fetchMock = vi.fn().mockResolvedValue(cancelledStandingResponse(slug))
    vi.stubGlobal('fetch', fetchMock)

    const page = await ActivityDetailPage({
      params: Promise.resolve({ slug }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('常驻活动')
    expect(html).toContain('STANDING · 已取消 · Asia/Shanghai (UTC+8)')
    expect(html).not.toContain('长期进行')
    expect(html).toContain('活动已取消')
    expect(html).toContain('因场地维修暂停开放。')
  })
})

describe('activity list page consumers', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('renders list with Direction Archive layout and observables', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sampleListResponse())
    vi.stubGlobal('fetch', fetchMock)

    const page = await ActivitiesPage({
      searchParams: Promise.resolve({ page: '1' }),
    })
    const html = renderToStaticMarkup(page)

    expect(listMetadata.title).toBe('活动目录')
    expect(html).toContain('EVENTS')
    expect(html).toContain('PROGRAM')
    expect(html).toContain('当前活动')
    expect(html).toContain('往期与已取消活动')
    expect(html).toContain('每周例行观测')
    expect(html).toContain('秋分星空开放夜')
    expect(html).toContain('英仙座流星雨观测')
    expect(html).toContain('月全食现场集中观测')
    expect(html).toContain('activity-card')
    expect(html).toContain('activity-multiline')
    expect(html).toContain('进行中')
    expect(html).toContain('即将开始')
    expect(html).toContain('已结束')
    expect(html).toContain('已取消')
    expect(html).toContain('因天气原因取消。')
    expect(html).toContain('activity-pagination')
    expect(html).toContain('第 1 页，共 2 页')
  })
})
