import type { Access } from 'payload'

import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'

export const canReadAuditEvent: Access = async ({ req }) => {
  const actor = await loadActor(req.payload, req)
  return actor
    ? authorize(actor, 'audit.read', { type: 'global' }, new Date()).allowed
    : false
}
