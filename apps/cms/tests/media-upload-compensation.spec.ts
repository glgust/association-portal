import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import type { ObjectStoragePort } from '@/modules/media/storage'
import { uploadMediaAsset } from '@/modules/media/upload'

async function fixture() {
  return sharp({
    create: {
      background: 'navy',
      channels: 3,
      height: 8,
      width: 12,
    },
  })
    .jpeg()
    .toBuffer()
}

function storageWithFailure(failedWrite: number) {
  let writes = 0
  const deleteMany = vi.fn(async (keys: readonly string[]) => {
    void keys
  })
  const storage: ObjectStoragePort = {
    delete: vi.fn(async () => undefined),
    deleteMany,
    get: vi.fn(async () => null),
    put: vi.fn(async () => {
      writes += 1
      if (writes === failedWrite) throw new Error('secret sdk failure')
    }),
  }
  return { deleteMany, storage }
}

describe('media upload compensation', () => {
  it.each([1, 2, 3, 4])(
    'settles all writes and compensates every planned key when write %s fails',
    async (failedWrite) => {
      const { deleteMany, storage } = storageWithFailure(failedWrite)
      const create = vi.fn()
      await expect(
        uploadMediaAsset({
          actorId: '10000000-0000-4000-8000-000000000001',
          body: await fixture(),
          claimedMimeType: 'image/jpeg',
          logger: vi.fn(),
          payload: { create } as never,
          req: {} as never,
          requestId: 'request-test',
          storage,
        }),
      ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 })
      expect(storage.put).toHaveBeenCalledTimes(4)
      expect(create).not.toHaveBeenCalled()
      expect(deleteMany).toHaveBeenCalledOnce()
      expect(deleteMany.mock.calls[0]?.[0]).toHaveLength(4)
    },
  )

  it('compensates a database failure and logs only safe cleanup context', async () => {
    const { deleteMany, storage } = storageWithFailure(99)
    deleteMany.mockRejectedValueOnce(new Error('delete secret'))
    const logger = vi.fn()
    await expect(
      uploadMediaAsset({
        actorId: '10000000-0000-4000-8000-000000000001',
        body: await fixture(),
        claimedMimeType: 'image/jpeg',
        logger,
        payload: {
          create: vi.fn(async () => {
            throw new Error('db failure')
          }),
        } as never,
        req: {} as never,
        requestId: 'request-safe',
        storage,
      }),
    ).rejects.toThrow('db failure')
    expect(deleteMany).toHaveBeenCalledOnce()
    expect(logger).toHaveBeenCalledWith({
      category: 'media_compensation_failed',
      objectPrefix: expect.stringMatching(/^[0-9a-f-]{36}$/),
      requestId: 'request-safe',
    })
    expect(JSON.stringify(logger.mock.calls)).not.toContain('secret')
  })

  it('waits for slower successful writes before compensating a failed write', async () => {
    let releaseSlowWrites!: () => void
    const slowWrites = new Promise<void>((resolve) => {
      releaseSlowWrites = resolve
    })
    let writes = 0
    const deleteMany = vi.fn(async () => undefined)
    const storage: ObjectStoragePort = {
      delete: vi.fn(async () => undefined),
      deleteMany,
      get: vi.fn(async () => null),
      put: vi.fn(async () => {
        writes += 1
        if (writes === 1) throw new Error('first write failed')
        await slowWrites
      }),
    }
    const pending = uploadMediaAsset({
      actorId: '10000000-0000-4000-8000-000000000001',
      body: await fixture(),
      claimedMimeType: 'image/jpeg',
      logger: vi.fn(),
      payload: { create: vi.fn() } as never,
      req: {} as never,
      requestId: 'request-delayed-writes',
      storage,
    })
    await vi.waitFor(() => expect(storage.put).toHaveBeenCalledTimes(4))
    expect(deleteMany).not.toHaveBeenCalled()
    releaseSlowWrites()
    await expect(pending).rejects.toMatchObject({ status: 503 })
    expect(deleteMany).toHaveBeenCalledOnce()
  })
})
