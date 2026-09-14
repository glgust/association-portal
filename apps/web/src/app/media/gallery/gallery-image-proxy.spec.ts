// @ts-expect-error The CMS Vitest runner supplies the shared test dependency.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './[slug]/image/[variant]/route'

describe('Gallery same-origin image proxy', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('forwards only safe image response metadata with no-store upstream', async () => {
    const bytes = new Uint8Array([82, 73, 70, 70])
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, {
        headers: {
          'content-length': String(bytes.byteLength),
          'content-type': 'image/webp',
          etag: '"fictional-etag"',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(new Request('http://localhost/ignored'), {
      params: Promise.resolve({ slug: 'fictional-nebula', variant: 'detail' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('content-length')).toBe('4')
    expect(response.headers.get('etag')).toBe('"fictional-etag"')
    expect(response.headers.get('cache-control')).toBe(
      'max-age=0, must-revalidate',
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3201/api/v1/content/gallery/fictional-nebula/image/detail',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('rejects variants outside the frozen four without contacting CMS', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await GET(new Request('http://localhost/ignored'), {
      params: Promise.resolve({
        slug: 'fictional-nebula',
        variant: 'original',
      }),
    })
    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards a bounded conditional request and preserves a controlled 304', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { etag: '"fictional-etag"' },
        status: 304,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(
      new Request('http://localhost/ignored', {
        headers: { 'if-none-match': '"fictional-etag"' },
      }),
      {
        params: Promise.resolve({
          slug: 'fictional-nebula',
          variant: 'thumbnail',
        }),
      },
    )

    expect(response.status).toBe(304)
    expect(response.headers.get('etag')).toBe('"fictional-etag"')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'if-none-match': '"fictional-etag"',
        }),
      }),
    )
  })

  it('maps controlled CMS 404 and sanitizes other upstream failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'NOT_FOUND',
            message: 'hidden upstream detail',
            requestId: 'fictional-image-not-found',
          },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('private storage failure', {
          headers: { 'x-request-id': 'fictional-image-unavailable' },
          status: 500,
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const context = {
      params: Promise.resolve({ slug: 'fictional-nebula', variant: 'list' }),
    }
    const notFoundResponse = await GET(
      new Request('http://localhost/ignored'),
      context,
    )
    const unavailableResponse = await GET(
      new Request('http://localhost/ignored'),
      context,
    )

    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toMatchObject({
      code: 'NOT_FOUND',
      requestId: 'fictional-image-not-found',
    })
    expect(unavailableResponse.status).toBe(503)
    const unavailableBody = await unavailableResponse.text()
    expect(unavailableBody).toContain('fictional-image-unavailable')
    expect(unavailableBody).not.toContain('private storage failure')
  })
})
