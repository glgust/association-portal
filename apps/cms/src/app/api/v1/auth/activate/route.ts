import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { activationResultSchema } from '@/modules/identity-access/dto'
import { activationSchema } from '@/modules/identity-access/schemas'
import { activateAccount } from '@/modules/identity-access/use-cases/activate'
export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const command = activationSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await activateAccount(payload, req, command, {
      now: new Date(),
      requestId,
    })
    return NextResponse.json(activationResultSchema.parse(result), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
