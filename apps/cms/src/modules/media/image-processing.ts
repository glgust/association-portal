import { createHash } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 60_000_000
export const MAX_IMAGE_EDGE = 16_384

export const MEDIA_VARIANTS = {
  display: { longestEdge: 3840, quality: 88 },
  detail: { longestEdge: 2560, quality: 85 },
  list: { longestEdge: 1280, quality: 82 },
  thumbnail: { longestEdge: 640, quality: 78 },
} as const

export type MediaVariantName = keyof typeof MEDIA_VARIANTS

export type ProcessedVariant = {
  body: Uint8Array
  byteSize: number
  height: number
  mimeType: 'image/webp'
  name: MediaVariantName
  sha256: string
  width: number
}

export class UnsafeImageError extends Error {}

function detectMime(
  buffer: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    Buffer.from(buffer.subarray(0, 8)).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return 'image/png'
  }
  if (
    buffer.length >= 12 &&
    Buffer.from(buffer.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(buffer.subarray(8, 12)).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

function containsPngAnimationControl(buffer: Uint8Array): boolean {
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const length = Buffer.from(
      buffer.subarray(offset, offset + 4),
    ).readUInt32BE(0)
    const type = Buffer.from(buffer.subarray(offset + 4, offset + 8)).toString(
      'ascii',
    )
    if (type === 'acTL') return true
    if (length > buffer.length - offset - 12) return false
    offset += length + 12
  }
  return false
}

function containsWebpAnimationControl(buffer: Uint8Array): boolean {
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const type = Buffer.from(buffer.subarray(offset, offset + 4)).toString(
      'ascii',
    )
    const length = Buffer.from(
      buffer.subarray(offset + 4, offset + 8),
    ).readUInt32LE(0)
    if (type === 'ANIM' || type === 'ANMF') return true
    if (length > buffer.length - offset - 8) return false
    offset += 8 + length + (length % 2)
  }
  return false
}

export async function processMediaImage(input: {
  body: Uint8Array
  claimedMimeType: string
}): Promise<ProcessedVariant[]> {
  if (input.body.byteLength > MAX_UPLOAD_BYTES) {
    throw new UnsafeImageError('Image exceeds the 10 MiB upload limit')
  }
  const actualMimeType = detectMime(input.body)
  if (!actualMimeType || actualMimeType !== input.claimedMimeType) {
    throw new UnsafeImageError('Image type does not match its content')
  }
  if (
    actualMimeType === 'image/png' &&
    containsPngAnimationControl(input.body)
  ) {
    throw new UnsafeImageError('Animated PNG is not supported')
  }
  if (
    actualMimeType === 'image/webp' &&
    containsWebpAnimationControl(input.body)
  ) {
    throw new UnsafeImageError('Animated WebP is not supported')
  }

  let metadata: Metadata
  try {
    metadata = await sharp(input.body, {
      animated: true,
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    }).metadata()
  } catch {
    throw new UnsafeImageError('Image could not be decoded safely')
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_IMAGE_EDGE ||
    metadata.height > MAX_IMAGE_EDGE ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS
  ) {
    throw new UnsafeImageError('Image dimensions exceed the safe limit')
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new UnsafeImageError('Animated images are not supported')
  }

  const variants: ProcessedVariant[] = []
  try {
    for (const [name, options] of Object.entries(MEDIA_VARIANTS)) {
      const { data, info } = await sharp(input.body, {
        animated: false,
        limitInputPixels: MAX_IMAGE_PIXELS,
        sequentialRead: true,
      })
        .rotate()
        .toColorspace('srgb')
        .resize({
          fit: 'inside',
          height: options.longestEdge,
          width: options.longestEdge,
          withoutEnlargement: true,
        })
        .webp({ quality: options.quality })
        .toBuffer({ resolveWithObject: true })
      variants.push({
        body: data,
        byteSize: data.byteLength,
        height: info.height,
        mimeType: 'image/webp' as const,
        name: name as MediaVariantName,
        sha256: createHash('sha256').update(data).digest('hex'),
        width: info.width,
      })
    }
  } catch {
    throw new UnsafeImageError('Image could not be decoded safely')
  }
  return variants
}
