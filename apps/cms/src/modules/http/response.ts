import type { ApiError } from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { BusinessError } from '@/modules/shared/business-error'

export function errorResponse(
  error: unknown,
  requestId: string,
): NextResponse<ApiError> {
  if (error instanceof BusinessError) {
    return NextResponse.json(
      {
        code: error.code,
        details: error.details,
        message: error.message,
        requestId,
      },
      { status: error.status },
    )
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        code: 'VALIDATION_FAILED',
        details: { issues: error.issues },
        message: 'Request validation failed',
        requestId,
      },
      { status: 400 },
    )
  }

  return NextResponse.json(
    {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId,
    },
    { status: 500 },
  )
}
