import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  MAX_UPLOAD_BYTES,
  MEDIA_VARIANTS,
  processMediaImage,
  UnsafeImageError,
} from '@/modules/media/image-processing'

async function expectUnsafe(body: Uint8Array, claimedMimeType: string) {
  await expect(
    processMediaImage({ body, claimedMimeType }),
  ).rejects.toBeInstanceOf(UnsafeImageError)
}

describe('media image processing', () => {
  it('creates four non-enlarged WebP variants without source metadata', async () => {
    const source = await sharp({
      create: {
        background: { alpha: 1, b: 80, g: 40, r: 12 },
        channels: 4,
        height: 300,
        width: 600,
      },
    })
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer()

    const variants = await processMediaImage({
      body: source,
      claimedMimeType: 'image/png',
    })
    expect(variants.map(({ name }) => name)).toEqual(
      Object.keys(MEDIA_VARIANTS),
    )
    for (const variant of variants) {
      const metadata = await sharp(variant.body).metadata()
      expect(variant.mimeType).toBe('image/webp')
      expect(variant.width).toBeLessThanOrEqual(
        MEDIA_VARIANTS[variant.name].longestEdge,
      )
      expect(variant.height).toBeLessThanOrEqual(
        MEDIA_VARIANTS[variant.name].longestEdge,
      )
      expect(variant.byteSize).toBe(variant.body.byteLength)
      expect(variant.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(metadata.exif).toBeUndefined()
      expect(metadata.orientation).toBeUndefined()
    }
  })

  it('strips real EXIF/GPS and preserves the auto-rotated aspect ratio', async () => {
    const source = await sharp({
      create: {
        background: { b: 80, g: 40, r: 12 },
        channels: 3,
        height: 300,
        width: 600,
      },
    })
      .withMetadata({ orientation: 6 })
      .withExifMerge({
        IFD0: { Artist: 'fictional fixture' },
        IFD3: {
          GPSLatitude: '23/1 8/1 0/1',
          GPSLatitudeRef: 'N',
          GPSLongitude: '113/1 20/1 0/1',
          GPSLongitudeRef: 'E',
        },
      })
      .jpeg()
      .toBuffer()
    await expect(sharp(source).metadata()).resolves.toMatchObject({
      exif: expect.any(Buffer),
      orientation: 6,
    })

    const variants = await processMediaImage({
      body: source,
      claimedMimeType: 'image/jpeg',
    })
    for (const variant of variants) {
      const metadata = await sharp(variant.body).metadata()
      expect(metadata.exif).toBeUndefined()
      expect(metadata.orientation).toBeUndefined()
      expect(variant.width / variant.height).toBeCloseTo(0.5, 2)
    }
  })

  it('rejects spoofed MIME and APNG before creating variants', async () => {
    const png = await sharp({
      create: {
        background: 'black',
        channels: 3,
        height: 2,
        width: 2,
      },
    })
      .png()
      .toBuffer()
    await expectUnsafe(png, 'image/jpeg')

    const acTL = Buffer.concat([
      png.subarray(0, 8),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('acTL'),
      Buffer.alloc(4),
      png.subarray(8),
    ])
    await expectUnsafe(acTL, 'image/png')
  })

  it.each([
    [
      'SVG',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image/svg+xml',
    ],
    ['GIF', Buffer.from('GIF89a'), 'image/gif'],
    ['unknown bytes', Buffer.from('not-an-image'), 'application/octet-stream'],
    ['malformed JPEG', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'],
  ])('rejects %s input', async (_name, body, claimedMimeType) => {
    await expectUnsafe(body, claimedMimeType)
  })

  it('rejects a PNG that exposes metadata but fails full pixel decoding', async () => {
    const malformed = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwMAAAAwBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    )
    await expect(sharp(malformed).metadata()).resolves.toMatchObject({
      format: 'png',
      height: 2,
      width: 2,
    })
    await expectUnsafe(malformed, 'image/png')
  })

  it('rejects input larger than 10 MiB before decoding', async () => {
    await expectUnsafe(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0xff), 'image/jpeg')
  })

  it('accepts static JPEG and static WebP', async () => {
    const source = sharp({
      create: {
        background: 'navy',
        channels: 3,
        height: 12,
        width: 20,
      },
    })
    const jpeg = await source.clone().jpeg().toBuffer()
    const webp = await source.clone().webp().toBuffer()

    await expect(
      processMediaImage({ body: jpeg, claimedMimeType: 'image/jpeg' }),
    ).resolves.toHaveLength(4)
    await expect(
      processMediaImage({ body: webp, claimedMimeType: 'image/webp' }),
    ).resolves.toHaveLength(4)
  })

  it('rejects animated WebP', async () => {
    const staticWebp = await sharp({
      create: {
        background: 'white',
        channels: 3,
        height: 2,
        width: 2,
      },
    })
      .webp()
      .toBuffer()
    const animationChunk = Buffer.concat([
      Buffer.from('ANIM'),
      Buffer.from([6, 0, 0, 0]),
      Buffer.alloc(6),
    ])
    const animatedWebp = Buffer.concat([staticWebp, animationChunk])
    animatedWebp.writeUInt32LE(animatedWebp.length - 8, 4)

    await expectUnsafe(animatedWebp, 'image/webp')
  })

  it('rejects an image edge above 16,384 pixels', async () => {
    const tooWide = await sharp({
      create: {
        background: 'black',
        channels: 3,
        height: 1,
        width: 16_385,
      },
    })
      .png()
      .toBuffer()

    await expectUnsafe(tooWide, 'image/png')
  })

  it('rejects more than 60 MP even when both edges are individually legal', async () => {
    const tooManyPixels = await sharp({
      create: {
        background: 'black',
        channels: 3,
        height: 6_001,
        width: 10_000,
      },
    })
      .png()
      .toBuffer()

    await expectUnsafe(tooManyPixels, 'image/png')
  })
})
