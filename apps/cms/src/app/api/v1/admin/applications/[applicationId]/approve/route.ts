import {
  approvalResultSchema,
  approveApplicationSchema,
} from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { approveApplication } from '@/modules/recruitment/use-cases/approve-application'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { applicationId } = await params
    const command = approveApplicationSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await approveApplication(payload, req, {
      applicationId,
      command,
      now: new Date(),
      requestId,
    })

    return NextResponse.json(
      approvalResultSchema.parse({
        applicationId: result.application.id,
        memberId: result.member.id,
        recordVersion: result.application.recordVersion,
        status: result.application.status,
      }),
      { headers: { 'x-request-id': requestId } },
    )
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
