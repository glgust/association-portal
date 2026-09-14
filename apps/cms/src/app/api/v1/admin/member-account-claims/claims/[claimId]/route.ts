import { getPayload } from 'payload'
import { z } from 'zod'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { createMemberClaimIdentityPort } from '@/modules/recruitment/member-account-claim/adapters'
import { getAccountClaimDetail } from '@/modules/recruitment/member-account-claim/admin/queries'

import {
  adminMembershipError,
  adminMembershipJson,
} from '@/app/api/v1/admin/member-account-claims/_shared'

const pathSchema = z.object({ claimId: z.string().uuid() }).strict()

export async function GET(
  request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { claimId } = pathSchema.parse(await context.params)
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    return adminMembershipJson(
      await getAccountClaimDetail(payload, req, claimId, {
        identity: createMemberClaimIdentityPort(payload),
        now: new Date(),
      }),
      requestId,
    )
  } catch (error) {
    return adminMembershipError(error, requestId)
  }
}
