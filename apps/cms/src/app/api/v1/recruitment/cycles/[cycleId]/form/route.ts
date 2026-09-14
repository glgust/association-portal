import { publicFormSchema } from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { BusinessError } from '@/modules/shared/business-error'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { cycleId } = await params
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const versions = await payload.find({
      collection: 'form-versions',
      limit: 1,
      overrideAccess: false,
      req,
      sort: '-version',
      where: {
        and: [
          { recruitmentCycle: { equals: cycleId } },
          { status: { equals: 'published' } },
        ],
      },
    })
    const version = versions.docs[0]
    if (!version)
      throw new BusinessError('NOT_FOUND', 'Published form not found', 404)

    return NextResponse.json(
      publicFormSchema.parse({
        formVersionId: version.id,
        recruitmentCycleId: cycleId,
        schema: version.schema,
        schemaHash: version.schemaHash,
        version: version.version,
      }),
      { headers: { 'x-request-id': requestId } },
    )
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
