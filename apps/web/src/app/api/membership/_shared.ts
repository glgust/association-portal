import {
  apiErrorSchema,
  membershipIdempotencyKeySchema,
  type ApiError,
} from '@ascnucc/contracts'

import { proxyToCms } from '@/server/cms-proxy'

type ParseResult<T> =
  | { data: T; success: true }
  | {
      error: { issues: Array<{ message: string; path: PropertyKey[] }> }
      success: false
    }

type ResponseSchema<T> = {
  safeParse(value: unknown): ParseResult<T>
}

const noStoreHeaders = (requestId: string) => ({
  'cache-control': 'no-store',
  'x-request-id': requestId,
})

export function requestIdFrom(request: Request): string {
  const supplied = request.headers.get('x-request-id')?.trim()
  return supplied && supplied.length <= 100 ? supplied : crypto.randomUUID()
}

export function validationResponse(
  requestId: string,
  issues: Array<{ message: string; path: PropertyKey[] }>,
): Response {
  return Response.json(
    {
      code: 'VALIDATION_FAILED',
      details: {
        issues: issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      },
      message: 'Request validation failed',
      requestId,
    } satisfies ApiError,
    { headers: noStoreHeaders(requestId), status: 400 },
  )
}

export function idempotencyKeyFrom(
  request: Request,
  requestId: string,
): Response | string {
  const key = request.headers.get('idempotency-key')?.trim()
  const parsed = membershipIdempotencyKeySchema.safeParse(key)
  if (!parsed.success) {
    return validationResponse(requestId, [
      {
        message: 'A valid Idempotency-Key header is required',
        path: ['idempotency-key'],
      },
    ])
  }
  return parsed.data
}

export async function parseRequest<T>(
  request: Request,
  requestId: string,
  schema: ResponseSchema<T>,
): Promise<Response | T> {
  const body = await request.json().catch(() => undefined)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return validationResponse(requestId, parsed.error.issues)
  }
  return parsed.data
}

export async function proxyMembership<T extends { requestId: string }>({
  body,
  idempotencyKey,
  path,
  requestId,
  responseSchema,
}: {
  body?: unknown
  idempotencyKey?: string
  path: string
  requestId: string
  responseSchema: ResponseSchema<T>
}): Promise<Response> {
  const headers = new Headers({ 'x-request-id': requestId })
  if (body !== undefined) headers.set('content-type', 'application/json')
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey)

  const upstream = await proxyToCms(`/api/v1/membership${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method: body === undefined ? 'GET' : 'POST',
  })
  const value = await upstream.json().catch(() => undefined)

  if (upstream.ok) {
    const parsed = responseSchema.safeParse(value)
    if (parsed.success) {
      return Response.json(parsed.data, {
        headers: noStoreHeaders(parsed.data.requestId),
        status: upstream.status,
      })
    }
  } else {
    const parsed = apiErrorSchema.safeParse(value)
    if (parsed.success) {
      return Response.json(parsed.data, {
        headers: noStoreHeaders(parsed.data.requestId),
        status: upstream.status,
      })
    }
  }

  return Response.json(
    {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Membership service is unavailable',
      requestId,
    } satisfies ApiError,
    { headers: noStoreHeaders(requestId), status: 503 },
  )
}
