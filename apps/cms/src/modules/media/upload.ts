import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'

import { BusinessError } from '@/modules/shared/business-error'

import {
  processMediaImage,
  type MediaVariantName,
  type ProcessedVariant,
  UnsafeImageError,
} from './image-processing'
import type { ObjectStoragePort } from './storage'

type SafeMediaLogger = (event: {
  category: 'media_compensation_failed'
  objectPrefix: string
  requestId: string
}) => void

function variantData(variant: ProcessedVariant, objectKey: string) {
  return {
    byteSize: variant.byteSize,
    height: variant.height,
    mimeType: variant.mimeType,
    objectKey,
    sha256: variant.sha256,
    width: variant.width,
  }
}

async function compensate(
  storage: ObjectStoragePort,
  keys: readonly string[],
  context: { logger: SafeMediaLogger; objectPrefix: string; requestId: string },
): Promise<void> {
  try {
    await storage.deleteMany(keys)
  } catch {
    context.logger({
      category: 'media_compensation_failed',
      objectPrefix: context.objectPrefix,
      requestId: context.requestId,
    })
  }
}

export async function uploadMediaAsset(input: {
  actorId: string
  body: Uint8Array
  claimedMimeType: string
  logger: SafeMediaLogger
  payload: Payload
  req: PayloadRequest
  requestId: string
  storage: ObjectStoragePort
}) {
  let variants: ProcessedVariant[]
  try {
    variants = await processMediaImage({
      body: input.body,
      claimedMimeType: input.claimedMimeType,
    })
  } catch (error) {
    if (error instanceof UnsafeImageError) {
      throw new BusinessError('VALIDATION_FAILED', error.message, 400)
    }
    throw error
  }

  const assetId = randomUUID()
  const objectPrefix = assetId
  const planned = Object.fromEntries(
    variants.map((variant) => [
      variant.name,
      `media/${objectPrefix}/${variant.name}.webp`,
    ]),
  ) as Record<MediaVariantName, string>
  const keys = Object.values(planned)
  const writes = await Promise.allSettled(
    variants.map((variant) =>
      input.storage.put({
        body: variant.body,
        contentType: variant.mimeType,
        key: planned[variant.name],
      }),
    ),
  )
  if (writes.some((write) => write.status === 'rejected')) {
    await compensate(input.storage, keys, {
      logger: input.logger,
      objectPrefix,
      requestId: input.requestId,
    })
    throw new BusinessError(
      'SERVICE_UNAVAILABLE',
      'Media storage is temporarily unavailable',
      503,
    )
  }

  const byName = Object.fromEntries(
    variants.map((variant) => [variant.name, variant]),
  ) as Record<MediaVariantName, ProcessedVariant>
  const display = byName.display
  try {
    input.req.context ??= {}
    input.req.context.mediaAssetCreate = true
    input.req.context.mediaAssetCreateActorId = input.actorId
    return await input.payload.create({
      collection: 'media-assets',
      data: {
        byteSize: display.byteSize,
        createdBy: input.actorId,
        detail: variantData(byName.detail, planned.detail),
        display: variantData(display, planned.display),
        height: display.height,
        id: assetId,
        list: variantData(byName.list, planned.list),
        mimeType: display.mimeType,
        objectPrefix,
        sha256: display.sha256,
        thumbnail: variantData(byName.thumbnail, planned.thumbnail),
        width: display.width,
      },
      overrideAccess: false,
      req: input.req,
    })
  } catch (error) {
    await compensate(input.storage, keys, {
      logger: input.logger,
      objectPrefix,
      requestId: input.requestId,
    })
    throw error
  } finally {
    delete input.req.context.mediaAssetCreate
    delete input.req.context.mediaAssetCreateActorId
  }
}
