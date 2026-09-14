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
import {
  isGlobalOnlyPermission,
  permissions,
} from '@/modules/authorization/permissions'
import {
  BusinessError,
  isUniqueViolation,
} from '@/modules/shared/business-error'

import {
  assertCanManage,
  manageableRoles,
  normalizeDisplayName,
  normalizeLoginName,
  roleExpiryForTransition,
  temporaryCredentialLifetimeMs,
} from '../domain'
import { generateTemporaryCredential } from '../credentials'
import { toAccountSummaryDto } from '../dto'
import { assertExpectedVersion } from '../guards'
import { requireAccountManager } from '../guards'
import { identityOperations, setIdentityOperation } from '../business-context'
import type {
  AccountActionCommand,
  CreateAccountCommand,
  UpdateAccountCommand,
} from '../schemas'
import { inIdentityTransaction, withAccountLock } from '../transaction'

const accountStatusPresentation = {
  active: {
    explanation: '账号可使用正式密码登录。',
    label: '可登录',
    reviewHref: null,
  },
  claimBlocked: {
    explanation: '认领已拒绝，可从会员认领管理页按条件重新开放。',
    label: '认领已阻止',
    reviewHref: '/admin/member-account-claims',
  },
  disabled: {
    explanation: '账号已停用，普通登录和现有会话均不可用。',
    label: '已停用',
    reviewHref: null,
  },
  pendingActivation: {
    explanation: '等待用户使用 72 小时临时凭证完成激活；可受控重新签发。',
    label: '等待临时凭证激活',
    reviewHref: '/admin/member-account-claims',
  },
  pendingApproval: {
    explanation: '用户已提交认领，等待管理员审核。',
    label: '等待认领审核',
    reviewHref: '/admin/member-account-claims',
  },
  pendingClaim: {
    explanation: '账号已预配置，等待用户设置正式密码并提交认领。',
    label: '等待用户认领',
    reviewHref: '/admin/member-account-claims',
  },
} as const

async function findAccountById(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
) {
  try {
    return await payload.findByID({
      collection: 'auth-users',
      id: accountId,
      overrideAccess: true,
      req,
    })
  } catch (error) {
    if (error instanceof NotFound) {
      throw new BusinessError('NOT_FOUND', 'Account not found', 404)
    }
    throw error
  }
}

function setContexts(
  req: PayloadRequest,
  operation: (typeof identityOperations)[keyof typeof identityOperations],
  auditOperation: (typeof auditOperations)[keyof typeof auditOperations],
): void {
  setIdentityOperation(req.context, operation)
  setAuditOperation(req.context, auditOperation)
}

async function audit(
  payload: Payload,
  req: PayloadRequest,
  input: {
    action: string
    actorId: string
    metadata: Record<string, unknown>
    now: Date
    requestId: string
    targetId: string
  },
): Promise<void> {
  await payload.create({
    collection: 'audit-events',
    data: {
      action: input.action,
      actor: input.actorId,
      metadata: input.metadata,
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

function storedOverrideScope(override: {
  recruitmentCycle?: null | string | { id: string }
  scopeType: 'global' | 'recruitmentCycle'
}): PermissionScope | null {
  const cycleId =
    typeof override.recruitmentCycle === 'string'
      ? override.recruitmentCycle
      : override.recruitmentCycle?.id
  if (override.scopeType === 'global' && !cycleId) return { type: 'global' }
  if (override.scopeType === 'recruitmentCycle' && cycleId) {
    return { recruitmentCycleId: cycleId, type: 'recruitmentCycle' }
  }
  return null
}

async function revokeIncompatibleOverrides(
  payload: Payload,
  req: PayloadRequest,
  input: { actorId: string; now: Date; role: AccountRole; userId: string },
): Promise<number> {
  const active = await payload.find({
    collection: 'permission-overrides',
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [
        { user: { equals: input.userId } },
        { revokedAt: { exists: false } },
      ],
    },
  })
  const incompatible = active.docs.filter((override) => {
    const scope = storedOverrideScope(override)
    return (
      !scope ||
      !isPermissionScopeCompatibleWithRole(
        input.role,
        override.permission,
        scope,
      )
    )
  })
  for (const override of incompatible) {
    await payload.update({
      collection: 'permission-overrides',
      id: override.id,
      data: {
        revokedAt: input.now.toISOString(),
        revokedBy: input.actorId,
      },
      overrideAccess: false,
      req,
    })
  }
  return incompatible.length
}

export async function listAccounts(
  payload: Payload,
  req: PayloadRequest,
  now: Date,
) {
  const actor = await requireAccountManager(payload, req, now)
  const result = await payload.find({
    collection: 'auth-users',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    pagination: false,
    req,
    sort: 'username',
    where: { role: { in: manageableRoles[actor.role] } },
  })
  return {
    accounts: result.docs.map(toAccountSummaryDto),
    capabilities: {
      targetRoles: manageableRoles[actor.role],
    },
  }
}

export async function getAccount(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  now: Date,
) {
  const actor = await requireAccountManager(payload, req, now)
  const account = await findAccountById(payload, req, accountId)
  assertCanManage(actor, account.id, account.role, account.role)
  const overrides = await payload.find({
    collection: 'permission-overrides',
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    sort: '-grantedAt',
    where: {
      and: [{ user: { equals: account.id } }, { revokedAt: { exists: false } }],
    },
  })
  return {
    ...toAccountSummaryDto(account),
    capabilities: {
      settablePermissions: permissions
        .filter(
          (permission) =>
            permission !== 'accounts.manage' ||
            (actor.role === 'owner' && account.role === 'cadre'),
        )
        .map((permission) => ({
          permission,
          scopes:
            (account.role === 'member' || account.role === 'staff') &&
            permission === 'recruitment.application.read'
              ? (['recruitmentCycle'] as const)
              : isGlobalOnlyPermission(permission)
                ? (['global'] as const)
                : (['global', 'recruitmentCycle'] as const),
        })),
    },
    loginName: account.username,
    overrides: overrides.docs.map((entry) => ({
      effect: entry.effect,
      expiresAt: entry.expiresAt ?? null,
      id: entry.id,
      permission: entry.permission,
      recruitmentCycleId:
        typeof entry.recruitmentCycle === 'string'
          ? entry.recruitmentCycle
          : (entry.recruitmentCycle?.id ?? null),
      scopeType: entry.scopeType,
    })),
    statusPresentation: accountStatusPresentation[account.status],
    studentNumber: account.studentNumber ?? null,
  }
}

export async function createAccount(
  payload: Payload,
  req: PayloadRequest,
  command: CreateAccountCommand,
  input: { now: Date; requestId: string },
) {
  const actor = await requireAccountManager(payload, req, input.now)
  assertCanManage(actor, null, null, command.role)
  const identity = normalizeLoginName(
    command.accountType,
    command.loginName,
    command.studentNumber,
  )
  const temporaryCredential = generateTemporaryCredential()
  const expiresAt = new Date(
    input.now.getTime() + temporaryCredentialLifetimeMs,
  ).toISOString()
  setContexts(
    req,
    identityOperations.createAccount,
    auditOperations.createAccount,
  )

  try {
    const account = await inIdentityTransaction(req, async () => {
      const created = await payload.create({
        collection: 'auth-users',
        data: {
          accountType: command.accountType,
          accessExpiresAt:
            command.role === 'staff'
              ? roleExpiryForTransition(null, 'staff', input.now)
              : null,
          defaultRoleExpiresAt:
            command.role === 'staff'
              ? roleExpiryForTransition(null, 'staff', input.now)
              : null,
          displayName: normalizeDisplayName(command.displayName),
          password: temporaryCredential,
          recordVersion: 1,
          role: command.role,
          status: 'pendingActivation',
          studentNumber: identity.studentNumber,
          temporaryCredentialExpiresAt: expiresAt,
          username: identity.loginName,
        },
        overrideAccess: false,
        req,
      })
      await audit(payload, req, {
        action: 'identity.account.created',
        actorId: actor.id,
        metadata: { reason: command.reason, role: command.role },
        now: input.now,
        requestId: input.requestId,
        targetId: created.id,
      })
      return created
    })
    return {
      account: toAccountSummaryDto(account),
      temporaryCredential,
      temporaryCredentialExpiresAt: expiresAt,
    }
  } catch (error) {
    const knownPayloadConflict =
      error instanceof ValidationError &&
      error.data.errors.some((entry) =>
        ['studentNumber', 'username'].includes(entry.path),
      )
    if (knownPayloadConflict || isUniqueViolation(error)) {
      throw new BusinessError(
        'CONFLICT',
        'Login name or student number already exists',
        409,
      )
    }
    throw error
  }
}

export async function updateAccount(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  command: UpdateAccountCommand,
  input: { now: Date; requestId: string },
) {
  const actor = await requireAccountManager(payload, req, input.now)
  return withAccountLock(payload, accountId, () => {
    setContexts(
      req,
      identityOperations.manageAccount,
      auditOperations.manageAccount,
    )
    return inIdentityTransaction(req, async () => {
      const current = await findAccountById(payload, req, accountId)
      assertExpectedVersion(current.recordVersion, command.expectedVersion)
      const nextRole = command.role ?? current.role
      assertCanManage(actor, current.id, current.role, nextRole)

      let defaultRoleExpiresAt = current.defaultRoleExpiresAt ?? null
      if (current.role !== nextRole) {
        defaultRoleExpiresAt =
          roleExpiryForTransition(current.role, nextRole, input.now) ?? null
      } else if (
        nextRole === 'staff' &&
        command.defaultRoleExpiresAt !== undefined
      ) {
        if (
          !command.defaultRoleExpiresAt ||
          new Date(command.defaultRoleExpiresAt) <= input.now
        ) {
          throw new BusinessError(
            'VALIDATION_FAILED',
            'Staff expiry must be in the future',
            400,
            {
              issues: [
                {
                  code: 'custom',
                  message: 'Staff expiry must be in the future',
                  path: ['defaultRoleExpiresAt'],
                },
              ],
            },
          )
        }
        defaultRoleExpiresAt = command.defaultRoleExpiresAt
      } else if (nextRole !== 'staff' && command.defaultRoleExpiresAt != null) {
        throw new BusinessError(
          'VALIDATION_FAILED',
          'Only staff can have a default role expiry',
          400,
          {
            issues: [
              {
                code: 'custom',
                message: 'Only staff can have a default role expiry',
                path: ['defaultRoleExpiresAt'],
              },
            ],
          },
        )
      }

      const revokedOverrideCount =
        current.role === nextRole
          ? 0
          : await revokeIncompatibleOverrides(payload, req, {
              actorId: actor.id,
              now: input.now,
              role: nextRole,
              userId: current.id,
            })

      const updated = await payload.update({
        collection: 'auth-users',
        id: current.id,
        data: {
          defaultRoleExpiresAt,
          displayName:
            command.displayName === undefined
              ? current.displayName
              : normalizeDisplayName(command.displayName),
          recordVersion: current.recordVersion + 1,
          role: nextRole,
          accessExpiresAt: defaultRoleExpiresAt,
        },
        overrideAccess: false,
        req,
      })
      await audit(payload, req, {
        action: 'identity.account.updated',
        actorId: actor.id,
        metadata: {
          changed: ['displayName', 'role', 'defaultRoleExpiresAt'],
          reason: command.reason,
          revokedIncompatibleOverrideCount: revokedOverrideCount,
        },
        now: input.now,
        requestId: input.requestId,
        targetId: current.id,
      })
      return toAccountSummaryDto(updated)
    })
  })
}

type AccountAction = 'disable' | 'reenable' | 'reset'

export async function changeAccountState(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  action: AccountAction,
  command: AccountActionCommand,
  input: { now: Date; requestId: string },
) {
  const actor = await requireAccountManager(payload, req, input.now)
  return withAccountLock(payload, accountId, () => {
    const auditOperation =
      action === 'disable'
        ? auditOperations.disableAccount
        : auditOperations.resetAccount
    const operation =
      action === 'disable'
        ? identityOperations.disableAccount
        : identityOperations.resetCredential
    setContexts(req, operation, auditOperation)
    return inIdentityTransaction(req, async () => {
      const current = await findAccountById(payload, req, accountId)
      assertExpectedVersion(current.recordVersion, command.expectedVersion)
      assertCanManage(actor, current.id, current.role, current.role)
      if (action === 'disable' && current.status === 'disabled') {
        throw new BusinessError('CONFLICT', 'Account is already disabled', 409)
      }
      if (
        action === 'disable' &&
        ['pendingClaim', 'pendingApproval', 'claimBlocked'].includes(
          current.status,
        )
      ) {
        throw new BusinessError(
          'CONFLICT',
          'Claim accounts require the claim-aware disable operation',
          409,
        )
      }
      if (action === 'reenable' && current.status !== 'disabled') {
        throw new BusinessError(
          'CONFLICT',
          'Only disabled accounts can be re-enabled',
          409,
        )
      }
      if (action === 'reset' && current.status !== 'active') {
        throw new BusinessError(
          'CONFLICT',
          'Only active accounts can be reset',
          409,
        )
      }

      const temporaryCredential =
        action === 'disable' ? null : generateTemporaryCredential()
      const expiresAt = temporaryCredential
        ? new Date(
            input.now.getTime() + temporaryCredentialLifetimeMs,
          ).toISOString()
        : null
      const updated = await payload.update({
        collection: 'auth-users',
        id: current.id,
        data: {
          ...(temporaryCredential ? { password: temporaryCredential } : {}),
          recordVersion: current.recordVersion + 1,
          status: action === 'disable' ? 'disabled' : 'pendingActivation',
          temporaryCredentialExpiresAt: expiresAt,
        },
        overrideAccess: false,
        req,
      })
      await payload.db.updateOne({
        collection: 'auth-users',
        id: current.id,
        data: { sessions: [] },
        req,
        returning: false,
      })
      await audit(payload, req, {
        action: `identity.account.${action}`,
        actorId: actor.id,
        metadata: { reason: command.reason },
        now: input.now,
        requestId: input.requestId,
        targetId: current.id,
      })
      const account = toAccountSummaryDto(updated)
      return temporaryCredential && expiresAt
        ? {
            account,
            temporaryCredential,
            temporaryCredentialExpiresAt: expiresAt,
          }
        : { account }
    })
  })
}

export async function reissuePendingActivationCredential(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  command: AccountActionCommand,
  input: { now: Date; requestId: string },
) {
  const actor = await requireAccountManager(payload, req, input.now)
  return withAccountLock(payload, accountId, () => {
    setContexts(
      req,
      identityOperations.reissueTemporaryCredential,
      auditOperations.reissueTemporaryCredential,
    )
    return inIdentityTransaction(req, async () => {
      const current = await findAccountById(payload, req, accountId)
      assertExpectedVersion(current.recordVersion, command.expectedVersion)
      assertCanManage(actor, current.id, current.role, current.role)
      if (current.status !== 'pendingActivation') {
        throw new BusinessError(
          'CONFLICT',
          'Only pending activation accounts can receive a new credential',
          409,
        )
      }
      const temporaryCredential = generateTemporaryCredential()
      const temporaryCredentialExpiresAt = new Date(
        input.now.getTime() + temporaryCredentialLifetimeMs,
      ).toISOString()
      const updated = await payload.update({
        collection: 'auth-users',
        id: current.id,
        data: {
          password: temporaryCredential,
          recordVersion: current.recordVersion + 1,
          temporaryCredentialExpiresAt,
        },
        overrideAccess: false,
        req,
      })
      await payload.db.updateOne({
        collection: 'auth-users',
        id: current.id,
        data: { sessions: [] },
        req,
        returning: false,
      })
      await audit(payload, req, {
        action: 'identity.account.temporary-credential-reissued',
        actorId: actor.id,
        metadata: { reason: command.reason },
        now: input.now,
        requestId: input.requestId,
        targetId: current.id,
      })
      return {
        account: toAccountSummaryDto(updated),
        temporaryCredential,
        temporaryCredentialExpiresAt,
      }
    })
  })
}
