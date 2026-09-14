import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import {
  createMemberClaimAuditPort,
  createMemberClaimIdentityPort,
} from '@/modules/recruitment/member-account-claim/adapters'
import { requireMemberClaimManager } from '@/modules/recruitment/member-account-claim/guards'
import { preconfigureSchema } from '@/modules/recruitment/member-account-claim/schemas'
import { preconfigureMemberAccountClaim } from '@/modules/recruitment/member-account-claim/use-cases/preconfigure'

import {
  adminMembershipError,
  adminMembershipJson,
} from '@/app/api/v1/admin/member-account-claims/_shared'

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const command = preconfigureSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const actor = await requireMemberClaimManager(payload, req, new Date())
    await preconfigureMemberAccountClaim(payload, req, {
      actorId: actor.id,
      audit: createMemberClaimAuditPort(payload),
      command,
      identity: createMemberClaimIdentityPort(payload),
      now: new Date(),
      requestId,
    })
    return adminMembershipJson({ updated: true }, requestId, 201)
  } catch (error) {
    return adminMembershipError(error, requestId)
  }
}
