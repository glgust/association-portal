import {
  membershipAccountClaimResultSchema,
  membershipAccountClaimSubmitSchema,
} from '@ascnucc/contracts'

import {
  idempotencyKeyFrom,
  parseRequest,
  proxyMembership,
  requestIdFrom,
} from '../_shared'

export async function POST(request: Request) {
  const requestId = requestIdFrom(request)
  const idempotencyKey = idempotencyKeyFrom(request, requestId)
  if (idempotencyKey instanceof Response) return idempotencyKey

  const command = await parseRequest(
    request,
    requestId,
    membershipAccountClaimSubmitSchema,
  )
  if (command instanceof Response) return command

  return proxyMembership({
    body: command,
    idempotencyKey,
    path: '/account-claims',
    requestId,
    responseSchema: membershipAccountClaimResultSchema,
  })
}
