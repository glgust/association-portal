import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import {
  listPublicNews,
  publicNewsQuerySchema,
} from '@/modules/content/news/public-read'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import config from '@/payload.config'

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const searchParams = new URL(request.url).searchParams
    const query = publicNewsQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    )
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await listPublicNews(payload, req, query)
    return NextResponse.json(result, {
      headers: { 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
