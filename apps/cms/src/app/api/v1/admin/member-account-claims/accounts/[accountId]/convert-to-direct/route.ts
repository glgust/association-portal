import { getPayload } from 'payload'
import { z } from 'zod'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import {
  createMemberClaimAuditPort,
  createMemberClaimIdentityPort,
} from '@/modules/recruitment/member-account-claim/adapters'
import { directConversionResultSchema } from '@/modules/recruitment/member-account-claim/admin/schemas'
import { convertClaimToDirectSchema } from '@/modules/recruitment/member-account-claim/schemas'
import { convertMemberClaimToDirect } from '@/modules/recruitment/member-account-claim/use-cases/convert-to-direct'

import {
  adminMembershipError,
  adminMembershipJson,
} from '@/app/api/v1/admin/member-account-claims/_shared'

const pathSchema = z.object({ accountId: z.string().uuid() }).strict()

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { accountId } = pathSchema.parse(await context.params)
    const command = convertClaimToDirectSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await convertMemberClaimToDirect(payload, req, accountId, {
      audit: createMemberClaimAuditPort(payload),
      command,
      identity: createMemberClaimIdentityPort(payload),
      now: new Date(),
      requestId,
    })
    return adminMembershipJson(
      directConversionResultSchema.parse({
        temporaryCredential: result.temporaryCredential,
        temporaryCredentialExpiresAt: result.temporaryCredentialExpiresAt,
      }),
      requestId,
    )
  } catch (error) {
    return adminMembershipError(error, requestId)
  }
}
