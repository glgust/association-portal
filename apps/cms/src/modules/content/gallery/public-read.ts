import {
  publicGalleryDetailSchema,
  publicGalleryListItemSchema,
  publicGalleryPageSchema,
  type PublicGalleryDetail,
  type PublicGalleryListItem,
  type PublicGalleryPage,
  type PublicGalleryImageVariant,
} from '@ascnucc/contracts'
import type { Payload, PayloadRequest } from 'payload'

import { publicContentPaginationQuerySchema } from '@/modules/content/shared/pagination'
import type { ObjectStoragePort, StoredObject } from '@/modules/media/storage'
import { BusinessError } from '@/modules/shared/business-error'

export const publicGalleryQuerySchema = publicContentPaginationQuerySchema

type Relation = string | { id?: unknown }

type GalleryDocument = {
  altText?: null | string
  id: string
  media?: null | Relation
  publicAuthorName?: null | string
  publishedAt?: null | string
  slug?: null | string
  summary?: null | string
  title?: null | string
}

type MediaVariant = {
  height?: null | number
  objectKey?: null | string
  width?: null | number
}

type MediaDocument = {
  display?: null | MediaVariant
  detail?: null | MediaVariant
  height?: null | number
  id: string
  list?: null | MediaVariant
  thumbnail?: null | MediaVariant
  width?: null | number
}

function relationId(value: GalleryDocument['media']): string | null {
  if (typeof value === 'string') return value
  return value && typeof value.id === 'string' ? value.id : null
}

async function findPublishedGallery(
  payload: Payload,
  req: PayloadRequest,
  slug: string,
): Promise<GalleryDocument | null> {
  const result = await payload.find({
    collection: 'gallery-works',
    depth: 0,
    draft: false,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: {
      altText: true,
      id: true,
      media: true,
      publicAuthorName: true,
      publishedAt: true,
      slug: true,
      summary: true,
      title: true,
    },
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }],
    },
  })
  return (result.docs[0] as GalleryDocument | undefined) ?? null
}

async function findMedia(
  payload: Payload,
  req: PayloadRequest,
  id: string,
): Promise<MediaDocument | null> {
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: {
      display: true,
      detail: true,
      height: true,
      id: true,
      list: true,
      thumbnail: true,
      width: true,
    },
    where: { id: { equals: id } },
  })
  return (result.docs[0] as MediaDocument | undefined) ?? null
}

function imagePath(slug: string, variant: PublicGalleryImageVariant): string {
  return `/api/v1/content/gallery/${encodeURIComponent(slug)}/image/${variant}`
}

function toPublicItem(
  gallery: GalleryDocument,
  media: MediaDocument,
): PublicGalleryListItem {
  const variant = (name: PublicGalleryImageVariant) => {
    const value = media[name]
    return {
      height: value?.height,
      path: imagePath(gallery.slug as string, name),
      width: value?.width,
    }
  }
  try {
    return publicGalleryListItemSchema.parse({
      authorName: gallery.publicAuthorName,
      id: gallery.id,
      image: {
        alt: gallery.altText,
        height: media.height,
        variants: {
          detail: variant('detail'),
          display: variant('display'),
          list: variant('list'),
          thumbnail: variant('thumbnail'),
        },
        width: media.width,
      },
      publishedAt: gallery.publishedAt,
      slug: gallery.slug,
      summary: gallery.summary ?? null,
      title: gallery.title,
    })
  } catch (cause) {
    throw new Error(
      'Published Gallery work cannot be mapped to its public contract',
      { cause },
    )
  }
}

async function mapPublishedGallery(
  payload: Payload,
  req: PayloadRequest,
  gallery: GalleryDocument,
): Promise<PublicGalleryListItem> {
  const mediaId = relationId(gallery.media)
  const media = mediaId ? await findMedia(payload, req, mediaId) : null
  if (!media) {
    throw new Error('Published Gallery work has no complete media asset')
  }
  return toPublicItem(gallery, media)
}

export async function listPublicGallery(
  payload: Payload,
  req: PayloadRequest,
  input: { page: number; pageSize: number },
): Promise<PublicGalleryPage> {
  const result = await payload.find({
    collection: 'gallery-works',
    depth: 0,
    draft: false,
    limit: input.pageSize,
    overrideAccess: true,
    page: input.page,
    req,
    select: {
      altText: true,
      id: true,
      media: true,
      publicAuthorName: true,
      publishedAt: true,
      slug: true,
      summary: true,
      title: true,
    },
    sort: ['-publishedAt', 'id'],
    where: { _status: { equals: 'published' } },
  })
  const items = await Promise.all(
    (result.docs as GalleryDocument[]).map((doc) =>
      mapPublishedGallery(payload, req, doc),
    ),
  )
  try {
    return publicGalleryPageSchema.parse({
      hasNextPage: result.hasNextPage,
      items,
      page: result.page ?? input.page,
      pageSize: result.limit,
      totalItems: result.totalDocs,
      totalPages: result.totalPages,
    })
  } catch (cause) {
    throw new Error('Published Gallery page metadata is invalid', { cause })
  }
}

export async function getPublicGallery(
  payload: Payload,
  req: PayloadRequest,
  slug: string,
): Promise<PublicGalleryDetail> {
  const gallery = await findPublishedGallery(payload, req, slug)
  if (!gallery) {
    throw new BusinessError('NOT_FOUND', 'Gallery work not found', 404)
  }
  return publicGalleryDetailSchema.parse(
    await mapPublishedGallery(payload, req, gallery),
  )
}

export async function getPublishedGalleryImage(
  payload: Payload,
  req: PayloadRequest,
  slug: string,
  variant: PublicGalleryImageVariant,
  storageFactory: () => ObjectStoragePort,
): Promise<StoredObject> {
  const gallery = await findPublishedGallery(payload, req, slug)
  if (!gallery) {
    throw new BusinessError('NOT_FOUND', 'Gallery image not found', 404)
  }
  const mediaId = relationId(gallery.media)
  const media = mediaId ? await findMedia(payload, req, mediaId) : null
  const objectKey = media?.[variant]?.objectKey
  if (typeof objectKey !== 'string') {
    throw new BusinessError(
      'SERVICE_UNAVAILABLE',
      'Gallery image is temporarily unavailable',
      503,
    )
  }
  try {
    const storage = storageFactory()
    const object = await storage.get(objectKey)
    if (!object || object.contentType !== 'image/webp') {
      throw new BusinessError(
        'SERVICE_UNAVAILABLE',
        'Gallery image is temporarily unavailable',
        503,
      )
    }
    return object
  } catch (error) {
    if (error instanceof BusinessError) throw error
    throw new BusinessError(
      'SERVICE_UNAVAILABLE',
      'Gallery image is temporarily unavailable',
      503,
    )
  }
}
