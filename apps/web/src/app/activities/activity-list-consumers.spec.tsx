import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error reuses the CMS Vitest runner without adding a Web dependency.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ActivitiesPage, { metadata } from './page'

function makeSamplePageResponse(items = sampleItems, page = 1, totalPages = 2) {
  return Response.json({
    asOf: '2026-09-04T12:00:00+08:00',
    hasNextPage: page < totalPages,
    items,
    page,
    pageSize: 10,
    totalItems: items.length * totalPages,
    totalPages,
  })
}

const sampleItems = [
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
]

describe('activity list page consumers', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('renders activity list with Direction Archive layout and observables', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeSamplePageResponse())
    vi.stubGlobal('fetch', fetchMock)

    const page = await ActivitiesPage({
      searchParams: Promise.resolve({ page: '1' }),
    })
    const html = renderToStaticMarkup(page)

    expect(metadata.title).toBe('活动目录')
    expect(html).toContain('EVENTS')
    expect(html).toContain('PROGRAM')
    expect(html).toContain('寻找下一次与星空相遇的机会。')
    expect(html).not.toContain('状态由服务端按时间推导')
    expect(html).not.toContain('所有状态以文字明确标注')
    expect(html).toContain('当前活动')
    expect(html).toContain('往期与已取消活动')
    expect(html).toContain('每周例行观测')
    expect(html).toContain('秋分星空开放夜')
    expect(html).toContain('英仙座流星雨观测')
    expect(html).toContain('月全食现场集中观测')
    expect(html).toContain('activity-card')
    expect(html).toContain('activity-multiline')
    expect(html).toContain('常驻观测活动摘要第一行')
    expect(html).toContain('进行中')
    expect(html).toContain('即将开始')
    expect(html).toContain('已结束')
    expect(html).toContain('已取消')
    expect(html).toContain('因天气原因取消。')
    expect(html).toContain('activity-pagination')
    expect(html).toContain('第 1 页，共 2 页')
  })

  it('renders empty state when there are no published activities', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeSamplePageResponse([], 1, 0))
    vi.stubGlobal('fetch', fetchMock)

    const page = await ActivitiesPage({
      searchParams: Promise.resolve({ page: '1' }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('暂时没有公开活动')
    expect(html).toContain('新活动发布后会显示在这里。')
  })

  it('renders controlled unavailable error panel on upstream failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'INTERNAL_ERROR',
          message: 'Upstream failed',
          requestId: 'test-list-req-999',
        },
        { status: 500 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const page = await ActivitiesPage({
      searchParams: Promise.resolve({ page: '1' }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('暂时无法载入活动目录')
    expect(html).toContain('活动服务暂时无法连接，请稍后再试。')
    expect(html).toContain('test-list-req-999')
  })
})
