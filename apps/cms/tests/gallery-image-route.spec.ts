import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createObjectStorage: vi.fn(),
  createPayloadRequest: vi.fn(),
  getPayload: vi.fn(),
}))

vi.mock('payload', () => ({ getPayload: mocks.getPayload }))
vi.mock('@/payload.config', () => ({ default: {} }))
vi.mock('@/config/environment', () => ({
  environment: { mediaStorage: { mode: 'local', root: 'D:/fictional' } },
}))
vi.mock('@/modules/media/storage', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/modules/media/storage')>()
  return { ...original, createObjectStorage: mocks.createObjectStorage }
})
vi.mock('@/modules/http/request', () => ({
  createPayloadRequest: mocks.createPayloadRequest,
  requestIdFrom: (headers: Headers) =>
    headers.get('x-request-id') ?? 'generated-request-id',
}))

let GET: typeof import('@/app/api/v1/content/gallery/[slug]/image/[variant]/route').GET

const gallery = {
  altText: '虚构图片',
  id: '11111111-2222-4333-8444-555555555555',
  media: '22222222-3333-4444-8555-666666666666',
  publicAuthorName: '虚构作者',
  publishedAt: '2026-08-29T00:00:00.000Z',
  slug: 'fictional-work',
  summary: null,
  title: '虚构作品',
}

const media = {
  detail: {
    height: 2,
    objectKey: 'media/private/detail.webp',
    width: 3,
  },
  id: gallery.media,
}

function request() {
  return new Request(
    'http://localhost/api/v1/content/gallery/fictional-work/image/detail',
    { headers: { 'x-request-id': 'route-request' } },
  )
}

beforeAll(async () => {
  ;({ GET } = await import(
    '@/app/api/v1/content/gallery/[slug]/image/[variant]/route'
  ))
})

beforeEach(() => {
  mocks.createObjectStorage.mockReset()
  mocks.createPayloadRequest.mockReset().mockResolvedValue({ id: 'request' })
  mocks.getPayload.mockReset()
})

describe('published-first Gallery image route', () => {
  it.each(['missing', 'draft', 'unpublished'])(
    'returns 404 for a %s slug before storage initialization',
    async () => {
      mocks.getPayload.mockResolvedValue({
        find: vi.fn(async () => ({ docs: [] })),
      })

      const response = await GET(request(), {
        params: Promise.resolve({ slug: 'fictional-work', variant: 'detail' }),
      })

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toMatchObject({
        code: 'NOT_FOUND',
        requestId: 'route-request',
      })
      expect(mocks.createObjectStorage).not.toHaveBeenCalled()
    },
  )

  it('maps storage initialization failure to a safe 503 only after publication is confirmed', async () => {
    let call = 0
    mocks.getPayload.mockResolvedValue({
      find: vi.fn(async () => ({ docs: call++ === 0 ? [gallery] : [media] })),
    })
    mocks.createObjectStorage.mockImplementation(() => {
      throw new Error('private endpoint and credential detail')
    })

    const response = await GET(request(), {
      params: Promise.resolve({ slug: gallery.slug, variant: 'detail' }),
    })

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Gallery image is temporarily unavailable',
      requestId: 'route-request',
    })
    expect(JSON.stringify(body)).not.toContain('private endpoint')
  })

  it('returns 404 for an invalid variant without loading Payload or storage', async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ slug: gallery.slug, variant: 'original' }),
    })

    expect(response.status).toBe(404)
    expect(mocks.getPayload).not.toHaveBeenCalled()
    expect(mocks.createObjectStorage).not.toHaveBeenCalled()
  })
})
