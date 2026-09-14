import { z } from 'zod'

import {
  permissions,
  permissionScopes,
} from '@/modules/authorization/permissions'

export const permissionOverrideSummarySchema = z
  .object({
    effect: z.enum(['allow', 'deny']),
    expiresAt: z.string().nullable(),
    id: z.string(),
    permission: z.enum(permissions),
    recruitmentCycleId: z.string().nullable(),
    scopeType: z.enum(permissionScopes),
  })
  .strict()

const accountSummaryShape = {
  accountType: z.enum(['student', 'external']),
  defaultRoleExpiresAt: z.string().nullable(),
  displayName: z.string(),
  id: z.string(),
  loginName: z.string(),
  recordVersion: z.number(),
  role: z.enum(['member', 'staff', 'cadre', 'admin', 'owner']),
  status: z.enum([
    'pendingActivation',
    'pendingClaim',
    'pendingApproval',
    'claimBlocked',
    'active',
    'disabled',
  ]),
} as const

export const accountSummarySchema = z.object(accountSummaryShape).strict()

export const permissionCapabilitySchema = z
  .object({
    permission: z.enum(permissions),
    scopes: z.array(z.enum(permissionScopes)).min(1),
  })
  .strict()

export const accountDetailCapabilitiesSchema = z
  .object({
    settablePermissions: z.array(permissionCapabilitySchema),
  })
  .strict()

export const accountDetailSchema = z
  .object({
    ...accountSummaryShape,
    capabilities: accountDetailCapabilitiesSchema,
    overrides: z.array(permissionOverrideSummarySchema),
    statusPresentation: z
      .object({
        explanation: z.string(),
        label: z.string(),
        reviewHref: z.string().nullable(),
      })
      .strict(),
    studentNumber: z.string().nullable(),
  })
  .strict()

export const temporaryCredentialResultSchema = z
  .object({
    account: accountSummarySchema,
    temporaryCredential: z.string(),
    temporaryCredentialExpiresAt: z.string(),
  })
  .strict()

export const managementCapabilitiesSchema = z
  .object({
    targetRoles: z.array(z.enum(['member', 'staff', 'cadre', 'admin'])),
  })
  .strict()

export const accountListResultSchema = z
  .object({
    accounts: z.array(accountSummarySchema),
    capabilities: managementCapabilitiesSchema,
  })
  .strict()

export const accountActionResultSchema = z
  .object({
    account: accountSummarySchema,
  })
  .strict()

export const overrideMutationResultSchema = z
  .object({
    accountVersion: z.number(),
    overrideId: z.string(),
  })
  .strict()

export const activationResultSchema = z
  .object({ activated: z.literal(true) })
  .strict()
export const passwordChangeResultSchema = z
  .object({ changed: z.literal(true) })
  .strict()

export type AccountSummaryDto = z.infer<typeof accountSummarySchema>
export type AccountDetailDto = z.infer<typeof accountDetailSchema>
export type ManagementCapabilities = z.infer<
  typeof managementCapabilitiesSchema
>

type AccountLike = {
  accountType: 'external' | 'student'
  defaultRoleExpiresAt?: null | string
  displayName: string
  id: string
  recordVersion: number
  role: 'admin' | 'cadre' | 'member' | 'owner' | 'staff'
  status:
    | 'active'
    | 'claimBlocked'
    | 'disabled'
    | 'pendingActivation'
    | 'pendingApproval'
    | 'pendingClaim'
  studentNumber?: null | string
  username: string
}

export function toAccountSummaryDto(account: AccountLike): AccountSummaryDto {
  const loginName =
    account.accountType === 'student'
      ? `••••${account.username.slice(-4)}`
      : account.username
  return accountSummarySchema.parse({
    accountType: account.accountType,
    defaultRoleExpiresAt: account.defaultRoleExpiresAt ?? null,
    displayName: account.displayName,
    id: account.id,
    loginName,
    recordVersion: account.recordVersion,
    role: account.role,
    status: account.status,
  })
}
