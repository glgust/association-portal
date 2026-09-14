import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { passwordChangeResultSchema } from '@/modules/identity-access/dto'
import { selfPasswordSchema } from '@/modules/identity-access/schemas'
import { changeOwnPassword } from '@/modules/identity-access/use-cases/self-service'
export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const command = selfPasswordSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await changeOwnPassword(payload, req, command, {
      now: new Date(),
      requestId,
    })
    return NextResponse.json(passwordChangeResultSchema.parse(result), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
