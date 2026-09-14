import type { Access } from 'payload'

import { authorize, type Permission } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'

async function isAllowed(
  permission: Permission,
  { req }: Parameters<Access>[0],
): Promise<boolean> {
  const actor = await loadActor(req.payload, req)
  return actor
    ? authorize(actor, permission, { type: 'global' }, new Date()).allowed
    : false
}

export const canCreateMediaAsset: Access = (args) =>
  args.req.context.mediaAssetCreate === true &&
  isAllowed('content.create', args)

export const canReadMediaAsset: Access = async (args) =>
  (await isAllowed('content.create', args)) || isAllowed('content.edit', args)
