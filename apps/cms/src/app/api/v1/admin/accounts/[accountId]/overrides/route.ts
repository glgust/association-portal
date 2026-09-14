import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { overrideMutationResultSchema } from '@/modules/identity-access/dto'
import {
  accountPathSchema,
  setOverrideSchema,
} from '@/modules/identity-access/schemas'
import { setPermissionOverride } from '@/modules/identity-access/use-cases/permission-overrides'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { accountId } = accountPathSchema.parse(await params)
    const command = setOverrideSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await setPermissionOverride(
      payload,
      req,
      accountId,
      command,
      { now: new Date(), requestId },
    )
    return NextResponse.json(overrideMutationResultSchema.parse(result), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
      status: 201,
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
