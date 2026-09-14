import { z } from 'zod'

export const accountRoleSchema = z.enum([
  'member',
  'staff',
  'cadre',
  'admin',
  'owner',
])
export const expectedVersionSchema = z.number().int().positive()
export const reasonSchema = z.string().trim().min(1).max(500)
export const passwordSchema = z.string().refine(
  (value) => {
    const codePointLength = Array.from(value).length
    return codePointLength >= 12 && codePointLength <= 128
  },
  { message: 'Password must contain 12 to 128 Unicode code points' },
)
export const accountPathSchema = z
  .object({ accountId: z.string().uuid() })
  .strict()
export const overridePathSchema = accountPathSchema
  .extend({ overrideId: z.string().uuid() })
  .strict()

export const createAccountSchema = z
  .object({
    accountType: z.enum(['student', 'external']),
    displayName: z.string(),
    loginName: z.string(),
    reason: reasonSchema,
    role: accountRoleSchema,
    studentNumber: z.string().nullable().optional(),
  })
  .strict()

export const updateAccountSchema = z
  .object({
    defaultRoleExpiresAt: z.iso.datetime().nullable().optional(),
    displayName: z.string().optional(),
    expectedVersion: expectedVersionSchema,
    reason: reasonSchema,
    role: accountRoleSchema.optional(),
  })
  .strict()

export const accountActionSchema = z
  .object({ expectedVersion: expectedVersionSchema, reason: reasonSchema })
  .strict()

export const activationSchema = z
  .object({
    loginName: z.string(),
    newPassword: passwordSchema,
    newPasswordConfirmation: z.string(),
    temporaryCredential: z.string(),
  })
  .strict()
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: 'Password confirmation does not match',
    path: ['newPasswordConfirmation'],
  })

export const selfDisplayNameSchema = z
  .object({ displayName: z.string(), expectedVersion: expectedVersionSchema })
  .strict()

export const selfPasswordSchema = z
  .object({
    currentPassword: z.string(),
    expectedVersion: expectedVersionSchema,
    newPassword: passwordSchema,
    newPasswordConfirmation: z.string(),
  })
  .strict()
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: 'Password confirmation does not match',
    path: ['newPasswordConfirmation'],
  })

export const setOverrideSchema = z
  .object({
    effect: z.enum(['allow', 'deny']),
    expectedVersion: expectedVersionSchema,
    expiresAt: z.iso.datetime().nullable().optional(),
    permission: z.string(),
    reason: reasonSchema,
    recruitmentCycleId: z.string().uuid().nullable().optional(),
    scopeType: z.enum(['global', 'recruitmentCycle']),
  })
  .strict()

export const revokeOverrideSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    reason: reasonSchema,
  })
  .strict()

export type CreateAccountCommand = z.infer<typeof createAccountSchema>
export type UpdateAccountCommand = z.infer<typeof updateAccountSchema>
export type AccountActionCommand = z.infer<typeof accountActionSchema>
export type ActivationCommand = z.infer<typeof activationSchema>
export type SelfDisplayNameCommand = z.infer<typeof selfDisplayNameSchema>
export type SelfPasswordCommand = z.infer<typeof selfPasswordSchema>
export type SetOverrideCommand = z.infer<typeof setOverrideSchema>
export type RevokeOverrideCommand = z.infer<typeof revokeOverrideSchema>
