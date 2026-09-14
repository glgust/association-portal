import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createNewsDetailLoader,
  getPublicNews,
  getPublicNewsPage,
  NewsNotFoundError,
  NewsUnavailableError,
} from '../../web/src/server/news'

describe('News Web server client', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses no-store JSON requests and maps network failures to unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getPublicNewsPage(1)).rejects.toBeInstanceOf(
      NewsUnavailableError,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
  })

  it('maps invalid JSON and strict DTO failures to unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not-json'))
      .mockResolvedValueOnce(
        Response.json({ _status: 'published', id: 'internal-shape' }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getPublicNewsPage(1)).rejects.toBeInstanceOf(
      NewsUnavailableError,
    )
    await expect(getPublicNews('invalid')).rejects.toBeInstanceOf(
      NewsUnavailableError,
    )
  })

  it('maps controlled detail 404 only and preserves list requestId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'NOT_FOUND',
            message: 'News not found',
            requestId: 'fictional-detail-request',
          },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'NOT_FOUND',
            message: 'News not found',
            requestId: 'fictional-list-request',
          },
          { status: 404 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getPublicNews('missing')).rejects.toBeInstanceOf(
      NewsNotFoundError,
    )
    await expect(getPublicNewsPage(1)).rejects.toMatchObject({
      name: 'NewsUnavailableError',
      requestId: 'fictional-list-request',
    })
  })

  it('memoizes one classified detail outcome per slug', async () => {
    const detail = {
      body: {
        blocks: [
          {
            children: [{ text: '虚构正文', type: 'text' as const }],
            type: 'paragraph' as const,
          },
        ],
        version: 1 as const,
      },
      id: '2c94a6c1-f2cf-4789-ae62-b700d80a2db6',
      publishedAt: '2026-07-19T10:00:00+08:00',
      slug: 'memoized-news',
      summary: null,
      title: '虚构新闻',
    }
    const fetchNews = vi.fn().mockResolvedValue(detail)
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
    const load = createNewsDetailLoader(
      fetchNews,
      memoize as Parameters<typeof createNewsDetailLoader>[1],
    )
    const metadata = await load(detail.slug)
    const body = await load(detail.slug)
    expect(fetchNews).toHaveBeenCalledTimes(1)
    expect(body).toBe(metadata)
  })

  it('does not send malformed slugs upstream', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(getPublicNews('%')).rejects.toBeInstanceOf(NewsNotFoundError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
