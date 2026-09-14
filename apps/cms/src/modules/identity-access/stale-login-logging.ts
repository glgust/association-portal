import type { PayloadRequest } from 'payload'

import { requestIdFrom } from '@/modules/http/request'

export const staleLoginLogEvent = 'identity.stale-login-write-rejected'
export const staleLoginErrorCategory = 'database_version_regression'

export function isM009LoginRace(error: unknown): boolean {
  let current: unknown = error
  const seen = new Set<unknown>()
  while (
    typeof current === 'object' &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)
    const candidate = current as {
      cause?: unknown
      code?: unknown
      message?: unknown
    }
    if (
      candidate.code === '40001' &&
      candidate.message === 'M009_AUTH_USER_STALE_WRITE'
    ) {
      return true
    }
    current = candidate.cause
  }
  return false
}

export function sanitizePayloadLogObject(
  logObject: Record<string, unknown>,
): Record<string, unknown> {
  if (!isM009LoginRace(logObject.err)) return logObject
  return {
    errorCategory: staleLoginErrorCategory,
    event: staleLoginLogEvent,
  }
}

export function logHandledM009LoginRace(req: PayloadRequest): void {
  req.payload.logger.warn({
    errorCategory: staleLoginErrorCategory,
    event: staleLoginLogEvent,
    requestId: requestIdFrom(req.headers),
  })
}
