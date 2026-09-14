import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { getPublicAnnouncement } from '@/modules/content/announcements/public-read'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import config from '@/payload.config'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { slug } = await params
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await getPublicAnnouncement(payload, req, slug)

    return NextResponse.json(result, {
      headers: { 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
