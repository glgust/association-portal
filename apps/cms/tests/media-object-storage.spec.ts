import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalObjectStorage } from '@/modules/media/storage/local-storage'
import { S3ObjectStorage } from '@/modules/media/storage/s3-storage'

const key = 'media/11111111-2222-4333-8444-555555555555/display.webp'

describe('object storage ports', () => {
  const roots: string[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
    )
  })

  it('keeps local put/get/delete private and idempotent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ascnucc-media-port-'))
    roots.push(root)
    const storage = new LocalObjectStorage(root)
    const body = Buffer.from('fictional-webp-bytes')
    await storage.put({ body, contentType: 'image/webp', key })
    await expect(storage.get(key)).resolves.toMatchObject({
      body,
      byteSize: body.byteLength,
      contentType: 'image/webp',
    })
    await storage.delete(key)
    await storage.delete(key)
    await expect(storage.get(key)).resolves.toBeNull()
    await expect(storage.get('../public.webp')).rejects.toThrow(
      'Invalid private media object key',
    )
  })

  it('keeps local batch deletion idempotent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ascnucc-media-port-'))
    roots.push(root)
    const storage = new LocalObjectStorage(root)
    const keys = [
      'media/11111111-2222-4333-8444-555555555555/display.webp',
      'media/11111111-2222-4333-8444-555555555555/detail.webp',
    ]
    for (const objectKey of keys) {
      await storage.put({
        body: Buffer.from('fictional-webp-bytes'),
        contentType: 'image/webp',
        key: objectKey,
      })
    }
    await storage.deleteMany(keys)
    await storage.deleteMany(keys)
    await expect(
      Promise.all(keys.map((objectKey) => storage.get(objectKey))),
    ).resolves.toEqual([null, null])
  })

  it('maps only public S3 commands and treats missing reads as null', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send')
    send
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({
        Body: { transformToByteArray: async () => Uint8Array.from([1, 2]) },
        ContentLength: 2,
        ContentType: 'image/webp',
        ETag: '"etag"',
      } as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(
        Object.assign(new Error('missing'), { name: 'NoSuchKey' }),
      )
    const storage = new S3ObjectStorage({
      accessKeyId: 'integration-access',
      bucket: 'ascnucc-media-integration',
      endpoint: 'http://127.0.0.1:19000',
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: 'integration-secret',
    })
    await storage.put({
      body: Uint8Array.from([1]),
      contentType: 'image/webp',
      key,
    })
    await expect(storage.get(key)).resolves.toMatchObject({ byteSize: 2 })
    await storage.delete(key)
    await storage.deleteMany([key])
    await expect(storage.get(key)).resolves.toBeNull()
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand)
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand)
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectCommand)
    expect(send.mock.calls[3]?.[0]).toBeInstanceOf(DeleteObjectsCommand)
    expect(send.mock.calls[4]?.[0]).toBeInstanceOf(GetObjectCommand)
  })

  it('treats a partial S3 multi-delete result as cleanup failure', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      Errors: [{ Code: 'AccessDenied', Key: key }],
    } as never)
    const storage = new S3ObjectStorage({
      accessKeyId: 'integration-access',
      bucket: 'ascnucc-media-integration',
      endpoint: 'http://127.0.0.1:19000',
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: 'integration-secret',
    })
    await expect(storage.deleteMany([key])).rejects.toThrow(
      'private media objects could not be deleted',
    )
  })
})
