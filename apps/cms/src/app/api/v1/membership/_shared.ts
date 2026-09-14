import {
  membershipIdempotencyKeySchema,
  type ApiError,
} from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { BusinessError } from '@/modules/shared/business-error'

export const noStoreHeaders = (requestId: string) => ({
  'cache-control': 'no-store',
  'x-request-id': requestId,
})

export function idempotencyKeyFrom(headers: Headers): string {
  const value = headers.get('idempotency-key')?.trim()
  const parsed = membershipIdempotencyKeySchema.safeParse(value)
  if (!parsed.success) {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'A valid Idempotency-Key header is required',
      400,
      {
        issues: [
          {
            code: 'custom',
            message: 'A valid Idempotency-Key header is required',
            path: ['idempotency-key'],
          },
        ],
      },
    )
  }
  return parsed.data
}

export function membershipErrorResponse(
  error: unknown,
  requestId: string,
): NextResponse<ApiError> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        code: 'VALIDATION_FAILED',
        details: { issues: error.issues },
        message: 'Request validation failed',
        requestId,
      },
      { headers: noStoreHeaders(requestId), status: 400 },
    )
  }
  if (error instanceof BusinessError) {
    return NextResponse.json(
      {
        code: error.code,
        ...(error.code === 'VALIDATION_FAILED' && error.details
          ? { details: error.details }
          : {}),
        message: error.message,
        requestId,
      },
      { headers: noStoreHeaders(requestId), status: error.status },
    )
  }
  return NextResponse.json(
    {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId,
    },
    { headers: noStoreHeaders(requestId), status: 500 },
  )
}
