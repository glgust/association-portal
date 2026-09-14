import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { getPublicNews } from '@/modules/content/news/public-read'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { BusinessError } from '@/modules/shared/business-error'
import config from '@/payload.config'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { slug } = await params
    let normalizedSlug: string
    try {
      normalizedSlug = decodeURIComponent(slug)
    } catch {
      throw new BusinessError('NOT_FOUND', 'News not found', 404)
    }
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await getPublicNews(payload, req, normalizedSlug)
    return NextResponse.json(result, {
      headers: { 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
