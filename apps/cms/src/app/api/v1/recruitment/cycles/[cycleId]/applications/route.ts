import {
  applicationResultSchema,
  applicationSubmitSchema,
} from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { submitApplication } from '@/modules/recruitment/use-cases/submit-application'
import { BusinessError } from '@/modules/shared/business-error'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { cycleId } = await params
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
    if (!idempotencyKey) {
      throw new BusinessError(
        'VALIDATION_FAILED',
        'Idempotency-Key header is required',
        400,
      )
    }

    const command = applicationSubmitSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const application = await submitApplication(payload, req, {
      command,
      idempotencyKey,
      now: new Date(),
      recruitmentCycleId: cycleId,
      requestId,
    })
    const formVersionId =
      typeof application.formVersion === 'string'
        ? application.formVersion
        : application.formVersion.id

    return NextResponse.json(
      applicationResultSchema.parse({
        formVersionId,
        id: application.id,
        recordVersion: application.recordVersion,
        status: application.status,
        submittedAt: application.submittedAt,
      }),
      { headers: { 'x-request-id': requestId }, status: 201 },
    )
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
