import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { listMemberClaimQueue } from '@/modules/recruitment/member-account-claim/admin/queries'
import { createMemberClaimIdentityPort } from '@/modules/recruitment/member-account-claim/adapters'
import { queueQuerySchema } from '@/modules/recruitment/member-account-claim/admin/schemas'

import { adminMembershipError, adminMembershipJson } from './_shared'

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const url = new URL(request.url)
    const query = queueQuerySchema.parse({
      processedCursor: url.searchParams.get('processedCursor') ?? undefined,
      processedFilter: url.searchParams.get('processedFilter') ?? undefined,
    })
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    return adminMembershipJson(
      await listMemberClaimQueue(payload, req, {
        identity: createMemberClaimIdentityPort(payload),
        now: new Date(),
        processedCursor: query.processedCursor,
        processedFilter: query.processedFilter,
      }),
      requestId,
    )
  } catch (error) {
    return adminMembershipError(error, requestId)
  }
}
