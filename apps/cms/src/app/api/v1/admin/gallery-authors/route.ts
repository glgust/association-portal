import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import {
  galleryAuthorPreviewRequestSchema,
  listGalleryAuthorCandidates,
  previewGalleryAuthorName,
} from '@/modules/content/gallery/author-candidates'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import config from '@/payload.config'
import { BusinessError } from '@/modules/shared/business-error'

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const pageValue = new URL(request.url).searchParams.get('page') ?? '1'
    const searchValue = new URL(request.url).searchParams.get('q') ?? ''
    if (!/^[1-9]\d{0,4}$/.test(pageValue)) {
      throw new BusinessError('VALIDATION_FAILED', 'Invalid page', 400)
    }
    const result = await listGalleryAuthorCandidates(
      payload,
      req,
      Number(pageValue),
      searchValue,
    )
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
        'x-request-id': requestId,
      },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const input = galleryAuthorPreviewRequestSchema.parse(await request.json())
    const result = await previewGalleryAuthorName(payload, req, input)
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
        'x-request-id': requestId,
      },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
