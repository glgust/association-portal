import { getPayload } from 'payload'
import { z } from 'zod'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import {
  createMemberClaimAuditPort,
  createMemberClaimIdentityPort,
} from '@/modules/recruitment/member-account-claim/adapters'
import { rejectClaimSchema } from '@/modules/recruitment/member-account-claim/schemas'
import { rejectAccountClaim } from '@/modules/recruitment/member-account-claim/use-cases/review-claim'

import {
  adminMembershipError,
  adminMembershipJson,
} from '@/app/api/v1/admin/member-account-claims/_shared'

const pathSchema = z.object({ claimId: z.string().uuid() }).strict()

export async function POST(
  request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { claimId } = pathSchema.parse(await context.params)
    const command = rejectClaimSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    await rejectAccountClaim(payload, req, claimId, {
      audit: createMemberClaimAuditPort(payload),
      command,
      identity: createMemberClaimIdentityPort(payload),
      now: new Date(),
      requestId,
    })
    return adminMembershipJson({ updated: true }, requestId)
  } catch (error) {
    return adminMembershipError(error, requestId)
  }
}
