import { publishedFormVersionResultSchema } from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { publishFormDefinition } from '@/modules/recruitment/use-cases/publish-form-definition'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ formDefinitionId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { formDefinitionId } = await params
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const version = await publishFormDefinition(
      payload,
      req,
      formDefinitionId,
      new Date(),
    )

    return NextResponse.json(
      publishedFormVersionResultSchema.parse({
        formDefinitionId,
        formVersionId: version.id,
        schemaHash: version.schemaHash,
        version: version.version,
      }),
      { headers: { 'x-request-id': requestId }, status: 201 },
    )
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
