import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { accountSummarySchema } from '@/modules/identity-access/dto'
import { selfDisplayNameSchema } from '@/modules/identity-access/schemas'
import { updateOwnDisplayName } from '@/modules/identity-access/use-cases/self-service'
export async function PATCH(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const command = selfDisplayNameSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await updateOwnDisplayName(payload, req, command, {
      now: new Date(),
      requestId,
    })
    return NextResponse.json(accountSummarySchema.parse(result), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
