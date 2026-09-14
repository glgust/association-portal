import assert from 'node:assert/strict'
import type { Payload, PayloadRequest } from 'payload'
import { describe, it } from 'vitest'

import type { ObjectStoragePort } from '@/modules/media/storage'
import { BusinessError } from '@/modules/shared/business-error'

import { getPublicGallery, getPublishedGalleryImage } from './public-read'

const gallery = {
  _status: 'published',
  altText: '虚构星云测试图',
  id: '5de0f5dc-74e0-4f9b-9cc7-33241fdab80f',
  media: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  publicAuthorName: '虚构观星者',
  publishedAt: '2026-08-26T20:00:00+08:00',
  slug: 'fictional-nebula',
  summary: null,
  title: '虚构星云',
}

const media = {
  display: {
    height: 1200,
    objectKey: 'media/11111111-2222-4333-8444-555555555555/display.webp',
    width: 1800,
  },
  detail: {
    height: 1200,
    objectKey: 'media/11111111-2222-4333-8444-555555555555/detail.webp',
    width: 1800,
  },
  height: 1200,
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  list: {
    height: 853,
    objectKey: 'media/11111111-2222-4333-8444-555555555555/list.webp',
    width: 1280,
  },
  thumbnail: {
    height: 427,
    objectKey: 'media/11111111-2222-4333-8444-555555555555/thumbnail.webp',
    width: 640,
  },
  width: 1800,
}

const req = {} as PayloadRequest

function payloadFor(...docs: unknown[]): Payload {
  let call = 0
  return {
    find: async () => ({ docs: docs[call++] ?? [] }),
  } as unknown as Payload
}

describe('public Gallery reads', () => {
  it('maps only the strict public fields and stable image routes', async () => {
    const result = await getPublicGallery(
      payloadFor([gallery], [media]),
      req,
      gallery.slug,
    )
    assert.deepEqual(Object.keys(result).sort(), [
      'authorName',
      'id',
      'image',
      'publishedAt',
      'slug',
      'summary',
      'title',
    ])
    assert.equal(
      result.image.variants.detail.path,
      '/api/v1/content/gallery/fictional-nebula/image/detail',
    )
    assert.equal('objectKey' in result.image.variants.detail, false)
  })

  it('checks current publication before touching private storage', async () => {
    let getCalls = 0
    const storage: ObjectStoragePort = {
      delete: async () => undefined,
      deleteMany: async () => undefined,
      get: async () => {
        getCalls += 1
        return null
      },
      put: async () => undefined,
    }
    await assert.rejects(
      getPublishedGalleryImage(
        payloadFor([]),
        req,
        gallery.slug,
        'detail',
        () => storage,
      ),
      (error: unknown) =>
        error instanceof BusinessError && error.status === 404,
    )
    assert.equal(getCalls, 0)
  })

  it('returns unavailable without exposing a missing private key', async () => {
    const storage: ObjectStoragePort = {
      delete: async () => undefined,
      deleteMany: async () => undefined,
      get: async () => null,
      put: async () => undefined,
    }
    await assert.rejects(
      getPublishedGalleryImage(
        payloadFor([gallery], [media]),
        req,
        gallery.slug,
        'detail',
        () => storage,
      ),
      (error: unknown) =>
        error instanceof BusinessError &&
        error.code === 'SERVICE_UNAVAILABLE' &&
        !error.message.includes('media/'),
    )
  })

  it('does not initialize storage for a missing or unpublished slug', async () => {
    let initializations = 0
    await assert.rejects(
      getPublishedGalleryImage(
        payloadFor([]),
        req,
        'unpublished-work',
        'detail',
        () => {
          initializations += 1
          throw new Error('missing storage configuration')
        },
      ),
      (error: unknown) =>
        error instanceof BusinessError &&
        error.code === 'NOT_FOUND' &&
        error.status === 404,
    )
    assert.equal(initializations, 0)
  })
})
