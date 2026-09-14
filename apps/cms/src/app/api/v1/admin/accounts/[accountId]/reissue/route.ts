import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { temporaryCredentialResultSchema } from '@/modules/identity-access/dto'
import {
  accountActionSchema,
  accountPathSchema,
} from '@/modules/identity-access/schemas'
import { reissuePendingActivationCredential } from '@/modules/identity-access/use-cases/accounts'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { accountId } = accountPathSchema.parse(await params)
    const command = accountActionSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await reissuePendingActivationCredential(
      payload,
      req,
      accountId,
      command,
      { now: new Date(), requestId },
    )
    return NextResponse.json(temporaryCredentialResultSchema.parse(result), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
