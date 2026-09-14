import { publicGalleryImageVariantSchema } from '@ascnucc/contracts'
import { getPayload } from 'payload'

import { environment } from '@/config/environment'
import { getPublishedGalleryImage } from '@/modules/content/gallery/public-read'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { createObjectStorage } from '@/modules/media/storage'
import { BusinessError } from '@/modules/shared/business-error'
import config from '@/payload.config'

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new BusinessError('NOT_FOUND', 'Gallery image not found', 404)
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; variant: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const raw = await params
    const slug = decodeSlug(raw.slug)
    const parsedVariant = publicGalleryImageVariantSchema.safeParse(raw.variant)
    if (!parsedVariant.success) {
      throw new BusinessError('NOT_FOUND', 'Gallery image not found', 404)
    }
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const object = await getPublishedGalleryImage(
      payload,
      req,
      slug,
      parsedVariant.data,
      () => {
        try {
          return createObjectStorage(environment.mediaStorage)
        } catch {
          throw new BusinessError(
            'SERVICE_UNAVAILABLE',
            'Gallery image is temporarily unavailable',
            503,
          )
        }
      },
    )
    const headers = new Headers({
      'Cache-Control': 'max-age=0, must-revalidate',
      'Content-Length': String(object.body.byteLength),
      'Content-Type': object.contentType,
      ETag: object.etag,
      'X-Content-Type-Options': 'nosniff',
      'x-request-id': requestId,
    })
    if (request.headers.get('if-none-match') === object.etag) {
      headers.delete('Content-Length')
      return new Response(null, { headers, status: 304 })
    }
    return new Response(Buffer.from(object.body), { headers, status: 200 })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
