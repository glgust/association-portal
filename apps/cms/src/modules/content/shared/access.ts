import type { Access } from 'payload'

import { authorize, type Permission } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'

export async function isAllowedGlobalContent(
  permission: Permission,
  { req }: Parameters<Access>[0],
): Promise<boolean> {
  const actor = await loadActor(req.payload, req)
  return actor
    ? authorize(actor, permission, { type: 'global' }, new Date()).allowed
    : false
}
