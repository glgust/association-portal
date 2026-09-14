import config from '@payload-config'
import { getPayload } from 'payload'

import { apiErrorSchema } from '@ascnucc/contracts'
import { getPublicActivity } from '@/modules/content/activities/public-read'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { BusinessError } from '@/modules/shared/business-error'

function errorResponse(
  requestId: string,
  code: 'INTERNAL_ERROR' | 'NOT_FOUND',
  message: string,
  status: number,
): Response {
  return Response.json(apiErrorSchema.parse({ code, message, requestId }), {
    headers: { 'x-request-id': requestId },
    status,
  })
}

function normaliseSlug(value: string): string | null {
  let slug: string
  try {
    slug = decodeURIComponent(value)
  } catch {
    return null
  }
  return slug.length >= 1 &&
    slug.length <= 96 &&
    !/[\\/?#\u0000-\u001f\u007f]/.test(slug)
    ? slug
    : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const asOf = new Date()
  const requestId = requestIdFrom(request.headers)
  const slug = normaliseSlug((await params).slug)
  if (!slug) {
    return errorResponse(requestId, 'NOT_FOUND', '活动不存在。', 404)
  }

  try {
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await getPublicActivity(payload, req, slug, asOf)
    return Response.json(result, {
      headers: { 'x-request-id': requestId },
      status: 200,
    })
  } catch (error) {
    if (
      error instanceof BusinessError &&
      error.code === 'NOT_FOUND' &&
      error.status === 404
    ) {
      return errorResponse(requestId, 'NOT_FOUND', '活动不存在。', 404)
    }
    return errorResponse(requestId, 'INTERNAL_ERROR', '活动暂时无法读取。', 500)
  }
}
