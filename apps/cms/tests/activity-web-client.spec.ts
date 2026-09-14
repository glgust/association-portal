import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ActivityNotFoundError,
  ActivityUnavailableError,
  createActivityDetailLoader,
  getPublicActivity,
  getPublicActivityPage,
} from '../../web/src/server/activities'

describe('activity Web server client', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('maps network failures to unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(getPublicActivityPage(1)).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
  })

  it('maps successful but invalid list and detail DTOs to unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: 'leaks-internal-shape' }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ _status: 'published', id: 'invalid-detail' }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getPublicActivityPage(1)).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
    await expect(getPublicActivity('invalid-detail')).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
  })

  it('maps a controlled 404 only for detail and keeps list unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'NOT_FOUND',
            message: 'Activity not found',
            requestId: 'fictional-request-id',
          },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'NOT_FOUND',
            message: 'Activity not found',
            requestId: 'fictional-list-request-id',
          },
          { status: 404 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getPublicActivity('missing')).rejects.toBeInstanceOf(
      ActivityNotFoundError,
    )
    await expect(getPublicActivityPage(1)).rejects.toMatchObject({
      name: 'ActivityUnavailableError',
      requestId: 'fictional-list-request-id',
    })
  })

  it('memoizes one detail outcome for metadata and body consumers', async () => {
    const activity = {
      activityType: 'standing' as const,
      body: {
        root: {
          children: [{ children: [], type: 'paragraph' as const }],
          type: 'root' as const,
          version: 1 as const,
        },
        version: 1 as const,
      },
      cancellationNote: null,
      id: '8c119b16-558f-4d8f-aee8-a61b73078b0f',
      location: '虚构地点',
      publishedAt: '2026-07-16T09:00:00+08:00',
      scheduleText: '每周五',
      slug: 'memoized-activity',
      status: 'ongoing' as const,
      summary: null,
      title: '虚构活动',
      version: 1 as const,
    }
    const fetchActivity = vi.fn().mockResolvedValue(activity)
    const memoize = (loader: (slug: string) => Promise<unknown>) => {
      const results = new Map<string, Promise<unknown>>()
      return (slug: string) => {
        const existing = results.get(slug)
        if (existing) return existing
        const result = loader(slug)
        results.set(slug, result)
        return result
      }
    }
    const load = createActivityDetailLoader(
      fetchActivity,
      memoize as Parameters<typeof createActivityDetailLoader>[1],
    )

    const metadataOutcome = await load(activity.slug)
    const bodyOutcome = await load(activity.slug)
    expect(fetchActivity).toHaveBeenCalledTimes(1)
    expect(bodyOutcome).toBe(metadataOutcome)
  })

  it('does not treat malformed slugs as upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn())

    await expect(getPublicActivity('%')).rejects.toBeInstanceOf(
      ActivityNotFoundError,
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
