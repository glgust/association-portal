import { isGlobalOnlyPermission, type Permission } from './permissions'

export type AccountRole = 'admin' | 'cadre' | 'member' | 'owner' | 'staff'
export type { Permission } from './permissions'
export type PermissionScope =
  | { type: 'global' }
  | { recruitmentCycleId: string; type: 'recruitmentCycle' }

export type PermissionOverride = {
  effect: 'allow' | 'deny'
  expiresAt?: Date
  permission: Permission
  scope: PermissionScope
}

export type Actor = {
  defaultRoleExpiresAt?: Date
  id: string
  overrides: PermissionOverride[]
  role: AccountRole
  status:
    | 'active'
    | 'claimBlocked'
    | 'disabled'
    | 'pendingActivation'
    | 'pendingApproval'
    | 'pendingClaim'
}

export type AuthorizationDecision = {
  allowed: boolean
  reason:
    | 'account_inactive'
    | 'explicit_allow'
    | 'explicit_deny'
    | 'invalid_scope'
    | 'role_default'
    | 'role_missing'
}

const rolePermissions: Record<AccountRole, ReadonlySet<Permission>> = {
  admin: new Set([
    'recruitment.application.read',
    'recruitment.form.manage',
    'content.create',
    'content.edit',
    'content.directPublish',
    'audit.read',
    'accounts.manage',
  ]),
  cadre: new Set([
    'recruitment.application.read',
    'recruitment.application.review',
    'content.create',
    'content.edit',
    'content.directPublish',
    'audit.read',
  ]),
  member: new Set(),
  owner: new Set([
    'recruitment.application.read',
    'recruitment.application.review',
    'recruitment.form.manage',
    'content.create',
    'content.edit',
    'content.directPublish',
    'audit.read',
    'accounts.manage',
  ]),
  staff: new Set(['content.create', 'content.edit', 'content.directPublish']),
}

export function roleDefaultPermissions(role: AccountRole): Permission[] {
  return [...rolePermissions[role]]
}

function matchesScope(
  overrideScope: PermissionScope,
  requestedScope: PermissionScope,
): boolean {
  if (overrideScope.type === 'global') return true
  return (
    requestedScope.type === 'recruitmentCycle' &&
    overrideScope.recruitmentCycleId === requestedScope.recruitmentCycleId
  )
}

export function isPermissionScopeCompatibleWithRole(
  role: AccountRole,
  permission: Permission,
  scope: PermissionScope,
): boolean {
  if (permission === 'accounts.manage' && role !== 'cadre') return false
  if (
    (role === 'member' || role === 'staff') &&
    permission === 'recruitment.application.read' &&
    scope.type !== 'recruitmentCycle'
  ) {
    return false
  }
  return true
}

export function authorize(
  actor: Actor,
  permission: Permission,
  scope: PermissionScope,
  now: Date,
): AuthorizationDecision {
  if (actor.status !== 'active') {
    return { allowed: false, reason: 'account_inactive' }
  }

  if (isGlobalOnlyPermission(permission) && scope.type !== 'global') {
    return { allowed: false, reason: 'invalid_scope' }
  }

  const applicable = actor.overrides.filter(
    (override) =>
      override.permission === permission &&
      (!override.expiresAt || override.expiresAt > now) &&
      matchesScope(override.scope, scope) &&
      (override.effect === 'deny' ||
        isPermissionScopeCompatibleWithRole(
          actor.role,
          override.permission,
          override.scope,
        )),
  )

  if (applicable.some((override) => override.effect === 'deny')) {
    return { allowed: false, reason: 'explicit_deny' }
  }

  if (applicable.some((override) => override.effect === 'allow')) {
    return { allowed: true, reason: 'explicit_allow' }
  }

  const rolePresetActive =
    actor.role !== 'staff' ||
    !actor.defaultRoleExpiresAt ||
    actor.defaultRoleExpiresAt > now
  if (rolePresetActive && rolePermissions[actor.role].has(permission)) {
    return { allowed: true, reason: 'role_default' }
  }

  return { allowed: false, reason: 'role_missing' }
}
