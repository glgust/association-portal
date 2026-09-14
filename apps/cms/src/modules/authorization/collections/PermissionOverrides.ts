import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  RelationshipFieldValidation,
} from 'payload'

import { denyAll } from '@/access/deny-all'
import {
  allowsIdentityOperation,
  identityOperations,
} from '@/modules/identity-access/business-context'
import {
  isGlobalOnlyPermission,
  permissionEffects,
  permissions,
  permissionScopes,
  type Permission,
} from '@/modules/authorization/permissions'
import { BusinessError } from '@/modules/shared/business-error'

type OverrideData = Record<string, unknown>

const grantAttributionFields = ['reason', 'grantedBy', 'grantedAt'] as const

function relationId(value: unknown): null | string {
  if (typeof value === 'string' && value.length > 0) return value
  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0
  ) {
    return value.id
  }
  return null
}

function hasDate(value: unknown): boolean {
  return (
    (typeof value === 'string' && value.length > 0) || value instanceof Date
  )
}

function sameDate(left: unknown, right: unknown): boolean {
  if (!hasDate(left) || !hasDate(right)) return left == null && right == null
  return (
    new Date(left as Date | string).getTime() ===
    new Date(right as Date | string).getTime()
  )
}

function hasReason(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function hasCompleteGrantAttribution(data: OverrideData): boolean {
  return (
    hasReason(data.reason) &&
    relationId(data.grantedBy) !== null &&
    hasDate(data.grantedAt)
  )
}

function hasNoGrantAttribution(data: OverrideData): boolean {
  return grantAttributionFields.every((field) => data[field] == null)
}

function validateScope(data: OverrideData): void {
  const cycleId = relationId(data.recruitmentCycle)
  const structurallyValid =
    (data.scopeType === 'global' && cycleId === null) ||
    (data.scopeType === 'recruitmentCycle' && cycleId !== null)
  if (!structurallyValid) {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'Global scope must not have a recruitment cycle, and recruitmentCycle scope must have one.',
      400,
    )
  }

  if (
    permissions.includes(data.permission as Permission) &&
    isGlobalOnlyPermission(data.permission as Permission) &&
    data.scopeType !== 'global'
  ) {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'This permission only supports global scope.',
      400,
    )
  }
}

function validateRevocation(data: OverrideData): void {
  const hasRevoker = relationId(data.revokedBy) !== null
  const hasRevokedAt = hasDate(data.revokedAt)
  if (hasRevoker !== hasRevokedAt) {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'revokedBy and revokedAt must be set or cleared together.',
      400,
    )
  }
}

function validateGrantAttribution(
  data: OverrideData,
  operation: 'create' | 'update',
  originalDoc?: OverrideData,
): void {
  if (operation === 'create') {
    if (!hasCompleteGrantAttribution(data)) {
      throw new BusinessError(
        'VALIDATION_FAILED',
        'New permission overrides require reason, grantedBy and grantedAt.',
        400,
      )
    }
    return
  }

  if (!originalDoc) {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'Stored permission override attribution is unavailable.',
      400,
    )
  }

  const originalIsComplete = hasCompleteGrantAttribution(originalDoc)
  const originalIsLegacy = hasNoGrantAttribution(originalDoc)
  if (!originalIsComplete && !originalIsLegacy) {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'Stored permission override attribution is inconsistent.',
      400,
    )
  }

  if (originalIsLegacy) {
    if (!hasNoGrantAttribution(data)) {
      throw new BusinessError(
        'VALIDATION_FAILED',
        'Legacy permission override attribution cannot be fabricated.',
        400,
      )
    }
    return
  }

  if (
    data.reason !== originalDoc.reason ||
    relationId(data.grantedBy) !== relationId(originalDoc.grantedBy) ||
    !sameDate(data.grantedAt, originalDoc.grantedAt)
  ) {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'Permission override grant attribution is immutable.',
      400,
    )
  }
}

function validatePermissionOverrideChange(args: {
  data?: OverrideData
  operation: 'create' | 'update'
  originalDoc?: OverrideData
}): OverrideData {
  const data = { ...(args.originalDoc ?? {}), ...(args.data ?? {}) }
  validateGrantAttribution(data, args.operation, args.originalDoc)
  validateRevocation(data)
  validateScope(data)
  return args.data ?? {}
}

export const validatePermissionOverrideBeforeValidate: CollectionBeforeValidateHook =
  (args) =>
    validatePermissionOverrideChange({
      data: args.data,
      operation: args.operation,
      originalDoc: args.originalDoc,
    })

export const validatePermissionOverrideBeforeChange: CollectionBeforeChangeHook =
  (args) =>
    validatePermissionOverrideChange({
      data: args.data,
      operation: args.operation,
      originalDoc: args.originalDoc,
    })

const validatePermissionScope: RelationshipFieldValidation = (
  value,
  { siblingData },
) => {
  const hasCycle = relationId(value) !== null
  const { permission, scopeType } = siblingData as {
    permission?: unknown
    scopeType?: unknown
  }
  if (
    permissions.includes(permission as Permission) &&
    isGlobalOnlyPermission(permission as Permission) &&
    scopeType !== 'global'
  ) {
    return 'This permission only supports global scope.'
  }
  if (scopeType === 'global' && !hasCycle) return true
  if (scopeType === 'recruitmentCycle' && hasCycle) return true
  return 'Global scope must not have a recruitment cycle, and recruitmentCycle scope must have one.'
}

export const PermissionOverrides: CollectionConfig = {
  slug: 'permission-overrides',
  admin: { group: false },
  labels: { plural: '权限覆盖记录', singular: '权限覆盖记录' },
  access: {
    create: allowsIdentityOperation(identityOperations.setOverride),
    delete: denyAll,
    read: ({ req }) =>
      req.user && req.context.authorizationActorLoad === true
        ? {
            user: {
              equals: req.user.id,
            },
          }
        : false,
    update: allowsIdentityOperation(
      identityOperations.manageAccount,
      identityOperations.setOverride,
    ),
  },
  hooks: {
    beforeChange: [validatePermissionOverrideBeforeChange],
    beforeValidate: [validatePermissionOverrideBeforeValidate],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      index: true,
      relationTo: 'auth-users',
      required: true,
    },
    {
      name: 'permission',
      type: 'select',
      options: [...permissions],
      required: true,
    },
    {
      name: 'effect',
      type: 'select',
      options: [...permissionEffects],
      required: true,
    },
    {
      name: 'scopeType',
      type: 'select',
      options: [...permissionScopes],
      required: true,
    },
    {
      name: 'recruitmentCycle',
      type: 'relationship',
      relationTo: 'recruitment-cycles',
      validate: validatePermissionScope,
    },
    { name: 'expiresAt', type: 'date' },
    { name: 'reason', type: 'textarea' },
    {
      name: 'grantedBy',
      type: 'relationship',
      relationTo: 'auth-users',
    },
    { name: 'grantedAt', type: 'date' },
    { name: 'revokedBy', type: 'relationship', relationTo: 'auth-users' },
    { name: 'revokedAt', type: 'date' },
  ],
}
