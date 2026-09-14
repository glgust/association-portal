import type { Payload, PayloadRequest } from 'payload'

import type { Actor, PermissionOverride, PermissionScope } from './authorize'
import { isGlobalOnlyPermission } from './permissions'

export async function loadActor(
  payload: Payload,
  req: PayloadRequest,
): Promise<Actor | null> {
  if (!req.user || req.user.collection !== 'auth-users') return null

  if (req.user.status !== 'active') return null

  req.context ??= {}
  req.context.authorizationActorLoad = true
  let overrides
  try {
    overrides = await payload.find({
      collection: 'permission-overrides',
      overrideAccess: false,
      pagination: false,
      req,
      where: {
        and: [
          { user: { equals: req.user.id } },
          { revokedAt: { exists: false } },
        ],
      },
    })
  } finally {
    delete req.context.authorizationActorLoad
  }

  try {
    return {
      defaultRoleExpiresAt:
        (req.user.defaultRoleExpiresAt ?? req.user.accessExpiresAt)
          ? new Date(req.user.defaultRoleExpiresAt ?? req.user.accessExpiresAt!)
          : undefined,
      id: req.user.id,
      overrides: overrides.docs.map((override): PermissionOverride => {
        const cycleId =
          typeof override.recruitmentCycle === 'string'
            ? override.recruitmentCycle
            : override.recruitmentCycle?.id
        if (
          isGlobalOnlyPermission(override.permission) &&
          override.scopeType !== 'global'
        ) {
          throw new Error(
            `Invalid permission override scope configuration: ${override.id}`,
          )
        }
        let scope: PermissionScope
        if (override.scopeType === 'global' && !cycleId) {
          scope = { type: 'global' }
        } else if (override.scopeType === 'recruitmentCycle' && cycleId) {
          scope = { recruitmentCycleId: cycleId, type: 'recruitmentCycle' }
        } else {
          throw new Error(
            `Invalid permission override scope configuration: ${override.id}`,
          )
        }

        return {
          effect: override.effect,
          expiresAt: override.expiresAt
            ? new Date(override.expiresAt)
            : undefined,
          permission: override.permission,
          scope,
        }
      }),
      role: req.user.role,
      status: req.user.status,
    }
  } catch {
    return null
  }
}
