import type { Payload, PayloadRequest } from 'payload'

import { authorize, type Actor } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import { BusinessError } from '@/modules/shared/business-error'

export async function requireAccountManager(
  payload: Payload,
  req: PayloadRequest,
  now: Date,
): Promise<Actor> {
  const actor = await loadActor(payload, req)
  if (!actor) {
    throw new BusinessError('UNAUTHENTICATED', 'Authentication required', 401)
  }
  const decision = authorize(actor, 'accounts.manage', { type: 'global' }, now)
  if (!decision.allowed) {
    throw new BusinessError(
      'FORBIDDEN',
      'Account management permission required',
      403,
      {
        reason: decision.reason,
      },
    )
  }
  return actor
}

export function assertExpectedVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new BusinessError('CONFLICT', 'Account has already changed', 409)
  }
}

export function requireSelf(
  req: PayloadRequest,
): NonNullable<PayloadRequest['user']> {
  if (
    !req.user ||
    req.user.collection !== 'auth-users' ||
    req.user.status !== 'active'
  ) {
    throw new BusinessError('UNAUTHENTICATED', 'Authentication required', 401)
  }
  return req.user
}
