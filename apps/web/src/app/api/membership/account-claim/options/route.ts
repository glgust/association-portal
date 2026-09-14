import { membershipAccountClaimOptionsSchema } from '@ascnucc/contracts'

import { proxyMembership, requestIdFrom } from '../../_shared'

export async function GET(request: Request) {
  return proxyMembership({
    path: '/account-claim/options',
    requestId: requestIdFrom(request),
    responseSchema: membershipAccountClaimOptionsSchema,
  })
}
