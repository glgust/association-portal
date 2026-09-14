import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPayloadRequest: vi.fn(),
  getPayload: vi.fn(),
  getPublicAssociationPage: vi.fn(),
}))

vi.mock('payload', () => ({ getPayload: mocks.getPayload }))
vi.mock('@/payload.config', () => ({ default: {} }))
vi.mock('@/modules/http/request', () => ({
  createPayloadRequest: mocks.createPayloadRequest,
  requestIdFrom: (headers: Headers) =>
    headers.get('x-request-id') ?? 'generated-request-id',
}))
vi.mock('@/modules/content/association-pages/public-read', () => ({
  getPublicAssociationPage: mocks.getPublicAssociationPage,
}))

let GET: typeof import('@/app/api/v1/content/association-pages/[pageKey]/route').GET

beforeAll(async () => {
  const route = await import(
    '@/app/api/v1/content/association-pages/[pageKey]/route'
  )
  GET = route.GET
})

beforeEach(() => {
  mocks.getPayload.mockReset()
  mocks.getPayload.mockResolvedValue({ id: 'payload' })
  mocks.createPayloadRequest.mockReset()
  mocks.createPayloadRequest.mockResolvedValue({ id: 'request' })
  mocks.getPublicAssociationPage.mockReset()
})

describe('public association page route', () => {
  it('returns the strict service result with the request id', async () => {
    const page = {
      body: { blocks: [], version: 1 },
      lead: null,
      pageKey: 'home',
      seoSummary: null,
      title: '首页',
      version: 1,
    }
    mocks.getPublicAssociationPage.mockResolvedValue(page)

    const response = await GET(
      new Request('http://localhost/api/v1/content/association-pages/home', {
        headers: { 'x-request-id': 'request-1' },
      }),
      { params: Promise.resolve({ pageKey: 'home' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBe('request-1')
    await expect(response.json()).resolves.toEqual(page)
    expect(mocks.getPublicAssociationPage).toHaveBeenCalledWith(
      { id: 'payload' },
      { id: 'request' },
      'home',
    )
  })

  it('does not leak an unexpected internal error', async () => {
    mocks.getPublicAssociationPage.mockRejectedValue(
      new Error('private database detail'),
    )

    const response = await GET(
      new Request('http://localhost/api/v1/content/association-pages/contact'),
      { params: Promise.resolve({ pageKey: 'contact' }) },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'generated-request-id',
    })
  })
})
