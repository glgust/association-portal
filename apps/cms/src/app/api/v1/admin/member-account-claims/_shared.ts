import { NextResponse } from 'next/server'

import { errorResponse } from '@/modules/http/response'

export const adminNoStoreHeaders = (requestId: string) => ({
  'cache-control': 'no-store',
  'x-request-id': requestId,
})

export function adminMembershipError(error: unknown, requestId: string) {
  const response = errorResponse(error, requestId)
  response.headers.set('cache-control', 'no-store')
  response.headers.set('x-request-id', requestId)
  return response
}

export function adminMembershipJson(
  body: unknown,
  requestId: string,
  status = 200,
) {
  return NextResponse.json(body, {
    headers: adminNoStoreHeaders(requestId),
    status,
  })
}
