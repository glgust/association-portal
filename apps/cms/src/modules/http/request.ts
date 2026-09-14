import { randomUUID } from 'node:crypto'
import { createLocalReq, type Payload, type PayloadRequest } from 'payload'

export function requestIdFrom(headers: Headers): string {
  const supplied = headers.get('x-request-id')?.trim()
  return supplied && supplied.length <= 100 ? supplied : randomUUID()
}

export async function createPayloadRequest(
  payload: Payload,
  headers: Headers,
): Promise<PayloadRequest> {
  const authentication = await payload.auth({ headers })
  return createLocalReq(
    {
      req: { headers },
      user: authentication.user ?? undefined,
    },
    payload,
  )
}
