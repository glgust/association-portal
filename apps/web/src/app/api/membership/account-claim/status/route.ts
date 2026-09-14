import {
  membershipStatusQuerySchema,
  membershipStatusResultSchema,
} from '@ascnucc/contracts'

import { parseRequest, proxyMembership, requestIdFrom } from '../../_shared'

export async function POST(request: Request) {
  const requestId = requestIdFrom(request)
  const command = await parseRequest(
    request,
    requestId,
    membershipStatusQuerySchema,
  )
  if (command instanceof Response) return command
  return proxyMembership({
    body: command,
    path: '/account-claim/status',
    requestId,
    responseSchema: membershipStatusResultSchema,
  })
}
