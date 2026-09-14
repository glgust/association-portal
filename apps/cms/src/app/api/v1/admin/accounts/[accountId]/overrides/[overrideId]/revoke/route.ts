import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { overrideMutationResultSchema } from '@/modules/identity-access/dto'
import {
  overridePathSchema,
  revokeOverrideSchema,
} from '@/modules/identity-access/schemas'
import { revokePermissionOverride } from '@/modules/identity-access/use-cases/permission-overrides'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string; overrideId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { accountId, overrideId } = overridePathSchema.parse(await params)
    const command = revokeOverrideSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await revokePermissionOverride(
      payload,
      req,
      accountId,
      overrideId,
      command,
      { now: new Date(), requestId },
    )
    return NextResponse.json(overrideMutationResultSchema.parse(result), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
