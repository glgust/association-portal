import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BusinessError } from '@/modules/shared/business-error'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createObjectStorage: vi.fn(),
  createPayloadRequest: vi.fn(),
  getPayload: vi.fn(),
  loadActor: vi.fn(),
  uploadMediaAsset: vi.fn(),
}))

vi.mock('payload', () => ({ getPayload: mocks.getPayload }))
vi.mock('@/payload.config', () => ({ default: {} }))
vi.mock('@/config/environment', () => ({
  environment: { mediaStorage: { mode: 'local', root: 'D:/fictional' } },
}))
vi.mock('@/modules/authorization/authorize', () => ({
  authorize: mocks.authorize,
}))
vi.mock('@/modules/authorization/load-actor', () => ({
  loadActor: mocks.loadActor,
}))
vi.mock('@/modules/media/storage', () => ({
  createObjectStorage: mocks.createObjectStorage,
}))
vi.mock('@/modules/media/upload', () => ({
  uploadMediaAsset: mocks.uploadMediaAsset,
}))
vi.mock('@/modules/http/request', () => ({
  createPayloadRequest: mocks.createPayloadRequest,
  requestIdFrom: (headers: Headers) =>
    headers.get('x-request-id') ?? 'generated-request-id',
}))

let POST: typeof import('@/app/api/v1/admin/media-assets/upload/route').POST

const actor = {
  id: '11111111-2222-4333-8444-555555555555',
  overrides: [],
  role: 'staff',
  status: 'active',
}

function uploadRequest(
  body: BodyInit = new Uint8Array([0xff, 0xd8, 0xff]),
  headers: Record<string, string> = {},
) {
  const init: RequestInit & { duplex?: 'half' } = {
    body,
    headers: {
      'content-type': 'image/jpeg',
      'x-request-id': 'upload-route-request',
      ...headers,
    },
    method: 'POST',
  }
  if (body instanceof ReadableStream) init.duplex = 'half'
  return new Request('http://localhost/api/v1/admin/media-assets/upload', init)
}

beforeAll(async () => {
  ;({ POST } = await import('@/app/api/v1/admin/media-assets/upload/route'))
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPayload.mockResolvedValue({ logger: { warn: vi.fn() } })
  mocks.createPayloadRequest.mockResolvedValue({ context: {}, user: actor })
  mocks.loadActor.mockResolvedValue(actor)
  mocks.authorize.mockReturnValue({ allowed: true })
  mocks.createObjectStorage.mockReturnValue({ id: 'storage' })
  mocks.uploadMediaAsset.mockResolvedValue({
    byteSize: 3,
    height: 1,
    id: '22222222-3333-4444-8555-666666666666',
    mimeType: 'image/webp',
    width: 1,
  })
})

describe('controlled media upload route', () => {
  it('returns 401 for anonymous callers with zero object or database use-case writes', async () => {
    mocks.createPayloadRequest.mockResolvedValue({ context: {} })
    mocks.loadActor.mockResolvedValue(null)
    const response = await POST(uploadRequest())
    expect(response.status).toBe(401)
    expect(mocks.createObjectStorage).not.toHaveBeenCalled()
    expect(mocks.uploadMediaAsset).not.toHaveBeenCalled()
  })

  it.each(['unauthorized', 'explicit deny', 'expired', 'illegal scope'])(
    'returns 403 for %s authorization with zero object or database use-case writes',
    async () => {
      mocks.authorize.mockReturnValue({ allowed: false })
      const response = await POST(uploadRequest())
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({
        code: 'FORBIDDEN',
        requestId: 'upload-route-request',
      })
      expect(mocks.createObjectStorage).not.toHaveBeenCalled()
      expect(mocks.uploadMediaAsset).not.toHaveBeenCalled()
    },
  )

  it('rejects Content-Length above 10 MiB before authentication or storage', async () => {
    const response = await POST(
      uploadRequest(undefined, {
        'content-length': String(10 * 1024 * 1024 + 1),
      }),
    )
    expect(response.status).toBe(413)
    expect(mocks.getPayload).not.toHaveBeenCalled()
    expect(mocks.createObjectStorage).not.toHaveBeenCalled()
    expect(mocks.uploadMediaAsset).not.toHaveBeenCalled()
  })

  it('rejects a chunked body above 10 MiB before storage or the upload use case', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024))
        controller.enqueue(new Uint8Array([1]))
      },
    })
    const response = await POST(uploadRequest(stream))
    expect(response.status).toBe(413)
    expect(mocks.createObjectStorage).not.toHaveBeenCalled()
    expect(mocks.uploadMediaAsset).not.toHaveBeenCalled()
  })

  it('maps unavailable configuration and object I/O to safe 503 JSON', async () => {
    mocks.createObjectStorage.mockImplementationOnce(() => {
      throw new Error('private endpoint detail')
    })
    const configResponse = await POST(uploadRequest())
    expect(configResponse.status).toBe(503)
    expect(JSON.stringify(await configResponse.json())).not.toContain(
      'private endpoint',
    )

    mocks.uploadMediaAsset.mockRejectedValueOnce(
      new BusinessError(
        'SERVICE_UNAVAILABLE',
        'Media storage is temporarily unavailable',
        503,
      ),
    )
    const objectResponse = await POST(uploadRequest())
    expect(objectResponse.status).toBe(503)
    expect(await objectResponse.json()).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Media storage is temporarily unavailable',
      requestId: 'upload-route-request',
    })
  })
})
