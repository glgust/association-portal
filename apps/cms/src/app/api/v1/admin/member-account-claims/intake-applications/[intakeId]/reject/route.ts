import { getPayload } from 'payload'
import { z } from 'zod'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { createMemberClaimAuditPort } from '@/modules/recruitment/member-account-claim/adapters'
import { rejectIntakeSchema } from '@/modules/recruitment/member-account-claim/schemas'
import { rejectMemberIntake } from '@/modules/recruitment/member-account-claim/use-cases/review-intake'

import {
  adminMembershipError,
  adminMembershipJson,
} from '@/app/api/v1/admin/member-account-claims/_shared'

const pathSchema = z.object({ intakeId: z.string().uuid() }).strict()

export async function POST(
  request: Request,
  context: { params: Promise<{ intakeId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { intakeId } = pathSchema.parse(await context.params)
    const command = rejectIntakeSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    await rejectMemberIntake(payload, req, intakeId, {
      audit: createMemberClaimAuditPort(payload),
      command,
      now: new Date(),
      requestId,
    })
    return adminMembershipJson({ updated: true }, requestId)
  } catch (error) {
    return adminMembershipError(error, requestId)
  }
}
