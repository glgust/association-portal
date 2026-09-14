import {
  NotFound,
  ValidationError,
  type Payload,
  type PayloadRequest,
} from 'payload'

import { auditOperations, setAuditOperation } from '@/modules/audit/context'
import {
  isPermissionScopeCompatibleWithRole,
  type AccountRole,
  type PermissionScope,
} from '@/modules/authorization/authorize'
import type {
  AuthUser,
  PermissionOverride as PermissionOverrideDocument,
} from '@/payload-types'
import { assertCanManage } from '@/modules/identity-access/domain'
import {
  globalOnlyPermissions,
  permissions,
  type Permission,
} from '@/modules/authorization/permissions'
import { BusinessError } from '@/modules/shared/business-error'

import { identityOperations, setIdentityOperation } from '../business-context'
import { assertExpectedVersion, requireAccountManager } from '../guards'
import type { RevokeOverrideCommand, SetOverrideCommand } from '../schemas'
import { inIdentityTransaction, withAccountLock } from '../transaction'

function findByIdOrNotFound(
  payload: Payload,
  req: PayloadRequest,
  collection: 'auth-users',
  id: string,
): Promise<AuthUser>
function findByIdOrNotFound(
  payload: Payload,
  req: PayloadRequest,
  collection: 'permission-overrides',
  id: string,
): Promise<PermissionOverrideDocument>
async function findByIdOrNotFound(
  payload: Payload,
  req: PayloadRequest,
  collection: 'auth-users' | 'permission-overrides',
  id: string,
) {
  try {
    return await payload.findByID({
      collection,
      id,
      overrideAccess: true,
      req,
    })
  } catch (error) {
    if (error instanceof NotFound) {
      throw new BusinessError('NOT_FOUND', 'Resource not found', 404)
    }
    throw error
  }
}

function validateOverride(
  actorRole: AccountRole,
  targetRole: AccountRole,
  command: SetOverrideCommand,
): Permission {
  if (!permissions.includes(command.permission as Permission)) {
    throw validationError('Unknown permission', 'permission')
  }
  const permission = command.permission as Permission
  const globalOnly = globalOnlyPermissions.includes(permission as never)
  const scopeValid =
    (command.scopeType === 'global' && !command.recruitmentCycleId) ||
    (command.scopeType === 'recruitmentCycle' &&
      Boolean(command.recruitmentCycleId))
  if (!scopeValid || (globalOnly && command.scopeType !== 'global')) {
    throw validationError('Invalid permission scope', 'scopeType')
  }
  if (
    permission === 'accounts.manage' &&
    !(actorRole === 'owner' && targetRole === 'cadre')
  ) {
    throw new BusinessError(
      'FORBIDDEN',
      'Only owner can change cadre account management',
      403,
    )
  }
  const scope: PermissionScope =
    command.scopeType === 'recruitmentCycle' && command.recruitmentCycleId
      ? {
          recruitmentCycleId: command.recruitmentCycleId,
          type: 'recruitmentCycle',
        }
      : { type: 'global' }
  if (!isPermissionScopeCompatibleWithRole(targetRole, permission, scope)) {
    throw validationError(
      'Permission scope is incompatible with the target role',
      'scopeType',
    )
  }
  return permission
}

function validationError(message: string, path: string): BusinessError {
  return new BusinessError('VALIDATION_FAILED', message, 400, {
    issues: [{ code: 'custom', message, path: [path] }],
  })
}

async function assertRecruitmentCycleExists(
  payload: Payload,
  req: PayloadRequest,
  recruitmentCycleId: string,
): Promise<void> {
  try {
    const result = await payload.find({
      collection: 'recruitment-cycles',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { id: { equals: recruitmentCycleId } },
    })
    if (result.docs.length === 0) {
      throw validationError(
        'Recruitment cycle does not exist',
        'recruitmentCycleId',
      )
    }
  } catch (error) {
    if (error instanceof BusinessError) throw error
    if (error instanceof ValidationError) {
      throw validationError(
        'Recruitment cycle does not exist',
        'recruitmentCycleId',
      )
    }
    throw error
  }
}

export function isActiveOverrideUniqueViolation(
  error: unknown,
  scopeType: SetOverrideCommand['scopeType'],
): boolean {
  const expectedConstraint =
    scopeType === 'global'
      ? 'permission_overrides_active_global_idx'
      : 'permission_overrides_active_cycle_idx'
  let current: unknown = error
  for (
    let depth = 0;
    depth < 6 && current && typeof current === 'object';
    depth += 1
  ) {
    const candidate = current as {
      cause?: unknown
      code?: unknown
      constraint?: unknown
    }
    if (
      candidate.code === '23505' &&
      typeof candidate.constraint === 'string' &&
      candidate.constraint === expectedConstraint
    ) {
      return true
    }
    current = candidate.cause
  }

  // Payload's PostgreSQL adapter converts 23505 into ValidationError and
  // discards the constraint name. These are the exact field signatures
  // emitted by the two M009 partial unique indexes; the localized human
  // message is deliberately ignored.
  if (error instanceof ValidationError && error.data.errors.length === 1) {
    const first = error.data.errors[0]
    const expectedPath =
      scopeType === 'global'
        ? 'user_id, permission'
        : 'user_id, permission, recruitment_cycle_id'
    return first.path === expectedPath
  }
  return false
}

async function activeOverrideExists(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  permission: Permission,
  command: SetOverrideCommand,
): Promise<boolean> {
  const result = await payload.find({
    collection: 'permission-overrides',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [
        { user: { equals: accountId } },
        { permission: { equals: permission } },
        { scopeType: { equals: command.scopeType } },
        { revokedAt: { exists: false } },
        command.scopeType === 'global'
          ? { recruitmentCycle: { exists: false } }
          : { recruitmentCycle: { equals: command.recruitmentCycleId } },
      ],
    },
  })
  return result.docs.length > 0
}

async function auditOverride(
  payload: Payload,
  req: PayloadRequest,
  input: {
    action: string
    actorId: string
    now: Date
    overrideId: string
    reason: string
    requestId: string
    targetId: string
  },
) {
  await payload.create({
    collection: 'audit-events',
    data: {
      action: input.action,
      actor: input.actorId,
      metadata: { overrideId: input.overrideId, reason: input.reason },
      occurredAt: input.now.toISOString(),
      requestId: input.requestId,
      result: 'success',
      targetId: input.targetId,
      targetType: 'auth-user',
    },
    overrideAccess: false,
    req,
  })
}

export async function setPermissionOverride(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  command: SetOverrideCommand,
  input: { now: Date; requestId: string },
) {
  const actor = await requireAccountManager(payload, req, input.now)
  try {
    return await withAccountLock(payload, accountId, () => {
      setIdentityOperation(req.context, identityOperations.setOverride)
      setAuditOperation(req.context, auditOperations.setPermissionOverride)
      return inIdentityTransaction(req, async () => {
        const target = await findByIdOrNotFound(
          payload,
          req,
          'auth-users',
          accountId,
        )
        assertExpectedVersion(target.recordVersion, command.expectedVersion)
        assertCanManage(actor, target.id, target.role, target.role)
        const permission = validateOverride(actor.role, target.role, command)
        if (
          command.scopeType === 'recruitmentCycle' &&
          command.recruitmentCycleId
        ) {
          await assertRecruitmentCycleExists(
            payload,
            req,
            command.recruitmentCycleId,
          )
        }
        if (
          await activeOverrideExists(
            payload,
            req,
            target.id,
            permission,
            command,
          )
        ) {
          throw new BusinessError(
            'CONFLICT',
            'An active override already exists',
            409,
          )
        }
        const created = await payload.create({
          collection: 'permission-overrides',
          data: {
            effect: command.effect,
            expiresAt: command.expiresAt ?? null,
            grantedAt: input.now.toISOString(),
            grantedBy: actor.id,
            permission,
            reason: command.reason,
            recruitmentCycle: command.recruitmentCycleId ?? null,
            scopeType: command.scopeType,
            user: target.id,
          },
          overrideAccess: false,
          req,
        })
        const updated = await payload.update({
          collection: 'auth-users',
          id: target.id,
          data: { recordVersion: target.recordVersion + 1 },
          overrideAccess: false,
          req,
        })
        await auditOverride(payload, req, {
          action: 'identity.permission-override.set',
          actorId: actor.id,
          now: input.now,
          overrideId: created.id,
          reason: command.reason,
          requestId: input.requestId,
          targetId: target.id,
        })
        return { accountVersion: updated.recordVersion, overrideId: created.id }
      })
    })
  } catch (error) {
    if (isActiveOverrideUniqueViolation(error, command.scopeType)) {
      throw new BusinessError(
        'CONFLICT',
        'An active override already exists',
        409,
      )
    }
    if (error instanceof ValidationError) {
      const first = error.data.errors[0]
      const path =
        first?.path === 'recruitmentCycle'
          ? 'recruitmentCycleId'
          : (first?.path ?? 'permission')
      throw validationError('Permission override validation failed', path)
    }
    throw error
  }
}

export async function revokePermissionOverride(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  overrideId: string,
  command: RevokeOverrideCommand,
  input: { now: Date; requestId: string },
) {
  const actor = await requireAccountManager(payload, req, input.now)
  return withAccountLock(payload, accountId, () => {
    setIdentityOperation(req.context, identityOperations.setOverride)
    setAuditOperation(req.context, auditOperations.setPermissionOverride)
    return inIdentityTransaction(req, async () => {
      const target = await findByIdOrNotFound(
        payload,
        req,
        'auth-users',
        accountId,
      )
      assertExpectedVersion(target.recordVersion, command.expectedVersion)
      assertCanManage(actor, target.id, target.role, target.role)
      const existing = await findByIdOrNotFound(
        payload,
        req,
        'permission-overrides',
        overrideId,
      )
      const userId =
        typeof existing.user === 'string' ? existing.user : existing.user.id
      if (userId !== target.id || existing.revokedAt) {
        throw new BusinessError('NOT_FOUND', 'Active override not found', 404)
      }
      if (
        existing.permission === 'accounts.manage' &&
        !(actor.role === 'owner' && target.role === 'cadre')
      ) {
        throw new BusinessError(
          'FORBIDDEN',
          'Only owner can change cadre account management',
          403,
        )
      }
      await payload.update({
        collection: 'permission-overrides',
        id: existing.id,
        data: { revokedAt: input.now.toISOString(), revokedBy: actor.id },
        overrideAccess: false,
        req,
      })
      const updated = await payload.update({
        collection: 'auth-users',
        id: target.id,
        data: { recordVersion: target.recordVersion + 1 },
        overrideAccess: false,
        req,
      })
      await auditOverride(payload, req, {
        action: 'identity.permission-override.revoked',
        actorId: actor.id,
        now: input.now,
        overrideId: existing.id,
        reason: command.reason,
        requestId: input.requestId,
        targetId: target.id,
      })
      return { accountVersion: updated.recordVersion, overrideId: existing.id }
    })
  })
}
