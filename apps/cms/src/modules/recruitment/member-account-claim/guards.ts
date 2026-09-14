import type { Payload, PayloadRequest } from 'payload'

import {
  authorize,
  type Actor,
  type AccountRole,
} from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import { assertCanManage } from '@/modules/identity-access/domain'
import { BusinessError } from '@/modules/shared/business-error'

export async function requireMemberClaimManager(
  payload: Payload,
  req: PayloadRequest,
  now: Date,
): Promise<Actor> {
  const actor = await loadActor(payload, req)
  if (!actor) {
    throw new BusinessError('UNAUTHENTICATED', 'Authentication required', 401)
  }
  if (
    (actor.role !== 'admin' && actor.role !== 'owner') ||
    !authorize(actor, 'accounts.manage', { type: 'global' }, now).allowed
  ) {
    throw new BusinessError(
      'FORBIDDEN',
      'Membership account review requires admin or owner',
      403,
    )
  }
  return actor
}

export function assertMemberClaimTarget(
  actor: Actor,
  targetId: string,
  role: AccountRole,
): void {
  assertCanManage(actor, targetId, role, role)
}
