import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { getPublicAssociationPage } from '@/modules/content/association-pages/public-read'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import config from '@/payload.config'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageKey: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await getPublicAssociationPage(
      payload,
      req,
      (await params).pageKey,
    )
    return NextResponse.json(result, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
