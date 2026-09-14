import config from '@payload-config'
import { getPayload } from 'payload'

import { apiErrorSchema } from '@ascnucc/contracts'
import {
  listPublicActivities,
  publicActivityQuerySchema,
} from '@/modules/content/activities/public-read'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'

function errorResponse(
  requestId: string,
  code: 'INTERNAL_ERROR' | 'VALIDATION_FAILED',
  message: string,
  status: number,
): Response {
  return Response.json(apiErrorSchema.parse({ code, message, requestId }), {
    headers: { 'x-request-id': requestId },
    status,
  })
}

export async function GET(request: Request): Promise<Response> {
  const asOf = new Date()
  const requestId = requestIdFrom(request.headers)
  const url = new URL(request.url)
  const input: Record<string, string> = {}
  for (const [key, value] of url.searchParams) {
    if (key in input) {
      return errorResponse(
        requestId,
        'VALIDATION_FAILED',
        '分页参数不得重复。',
        400,
      )
    }
    input[key] = value
  }
  const parsed = publicActivityQuerySchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse(
      requestId,
      'VALIDATION_FAILED',
      '活动目录分页参数无效。',
      400,
    )
  }

  try {
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await listPublicActivities(payload, req, parsed.data, asOf)
    return Response.json(result, {
      headers: { 'x-request-id': requestId },
      status: 200,
    })
  } catch {
    return errorResponse(
      requestId,
      'INTERNAL_ERROR',
      '活动目录暂时无法读取。',
      500,
    )
  }
}
