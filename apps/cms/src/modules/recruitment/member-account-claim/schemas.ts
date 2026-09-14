import { z } from 'zod'

import {
  permissions,
  permissionScopes,
} from '@/modules/authorization/permissions'

import {
  claimRejectionReasons,
  contactTypes,
  memberSources,
  membershipIdentities,
} from './domain'

export const membershipIdentitySchema = z.enum(membershipIdentities)
export const contactSchema = z
  .object({
    isPrimary: z.boolean(),
    label: z.string().nullable().optional(),
    type: z.enum(contactTypes),
    value: z.string(),
  })
  .strict()
export const contactsSchema = z.array(contactSchema).min(1).max(10)

export const publicMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(
    (value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value),
    'Public message must not contain control characters',
  )

const profileSchema = z
  .object({
    contacts: contactsSchema,
    major: z.string().nullable().optional(),
    membershipIdentity: membershipIdentitySchema,
    name: z.string(),
    source: z.enum(memberSources),
    studentNumber: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.membershipIdentity !== 'member' && !profile.major) {
      context.addIssue({
        code: 'custom',
        message: 'Major is required for staff and cadre Member profiles',
        path: ['major'],
      })
    }
  })

export const submitClaimSchema = z
  .object({
    contacts: contactsSchema,
    major: z.string().nullable().optional(),
    membershipIdentity: membershipIdentitySchema,
    name: z.string(),
    password: z.string().refine((value) => {
      const length = Array.from(value).length
      return length >= 12 && length <= 128
    }, 'Password must contain 12 to 128 Unicode code points'),
    passwordConfirmation: z.string(),
    studentNumber: z.string(),
  })
  .strict()
  .refine(
    ({ password, passwordConfirmation }) => password === passwordConfirmation,
    {
      message: 'Password confirmation does not match',
      path: ['passwordConfirmation'],
    },
  )

export const submitIntakeSchema = z
  .object({
    contacts: contactsSchema,
    major: z.string().nullable().optional(),
    membershipIdentity: membershipIdentitySchema,
    name: z.string(),
    privacyPurposeConfirmed: z.literal(true),
    studentNumber: z.string().nullable().optional(),
  })
  .strict()

export const preconfigureSchema = z
  .object({
    member: z
      .object({ memberId: z.string().uuid(), mode: z.literal('existing') })
      .strict()
      .or(
        z
          .object({
            mode: z.literal('create'),
            offlineInterviewConfirmed: z.literal(true),
            profile: profileSchema,
          })
          .strict(),
      ),
    role: z.enum(['member', 'staff', 'cadre']),
    overrides: z
      .array(
        z
          .object({
            effect: z.enum(['allow', 'deny']),
            expiresAt: z.iso.datetime().nullable().optional(),
            permission: z.enum(permissions),
            reason: z.string().trim().min(1).max(500),
            recruitmentCycleId: z.string().uuid().nullable().optional(),
            scopeType: z.enum(permissionScopes),
          })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict()

export const reviewClaimSchema = z
  .object({
    confirmCurrentAuthorization: z.boolean().default(false),
    expectedAccountVersion: z.number().int().positive(),
    expectedClaimVersion: z.number().int().positive(),
    publicMessage: publicMessageSchema.optional(),
  })
  .strict()

export const rejectClaimSchema = reviewClaimSchema
  .omit({ confirmCurrentAuthorization: true })
  .extend({
    publicMessage: publicMessageSchema.optional(),
    reason: z.enum(claimRejectionReasons),
  })
  .strict()

export const reviewIntakeSchema = z
  .object({
    adoptApplicationProfile: z.boolean().default(false),
    expectedVersion: z.number().int().positive(),
    publicMessage: publicMessageSchema.optional(),
    member: z
      .object({ memberId: z.string().uuid(), mode: z.literal('existing') })
      .strict()
      .or(z.object({ mode: z.literal('create') }).strict()),
  })
  .strict()

export const rejectIntakeSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    publicMessage: publicMessageSchema.optional(),
    reason: z.enum(claimRejectionReasons),
  })
  .strict()

export const reopenClaimSchema = z
  .object({
    expectedAccountVersion: z.number().int().positive(),
    expectedClaimVersion: z.number().int().positive(),
    publicMessage: publicMessageSchema.optional(),
    reason: z.enum(claimRejectionReasons),
  })
  .strict()

export const convertClaimToDirectSchema = z
  .object({
    claimId: z.string().uuid(),
    confirmEffects: z.literal(true),
    expectedAccountVersion: z.number().int().positive(),
    expectedClaimVersion: z.number().int().positive(),
    publicMessage: publicMessageSchema.optional(),
    reason: z.enum(claimRejectionReasons),
  })
  .strict()

export const disableClaimSchema = z
  .object({
    expectedAccountVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const withdrawClaimConversionSchema = z
  .object({
    confirmEffects: z.literal(true),
    expectedAccountVersion: z.number().int().positive(),
    expectedClaimVersion: z.number().int().positive(),
    publicMessage: publicMessageSchema.optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const statusReceiptMutationSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const updatePublicMessageSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    publicMessage: publicMessageSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export type SubmitClaimCommand = z.infer<typeof submitClaimSchema>
export type SubmitIntakeCommand = z.infer<typeof submitIntakeSchema>
export type PreconfigureCommand = z.infer<typeof preconfigureSchema>
export type ReviewClaimCommand = z.infer<typeof reviewClaimSchema>
export type RejectClaimCommand = z.infer<typeof rejectClaimSchema>
export type ReviewIntakeCommand = z.infer<typeof reviewIntakeSchema>
export type RejectIntakeCommand = z.infer<typeof rejectIntakeSchema>
export type ReopenClaimCommand = z.infer<typeof reopenClaimSchema>
export type ConvertClaimToDirectCommand = z.infer<
  typeof convertClaimToDirectSchema
>
export type DisableClaimCommand = z.infer<typeof disableClaimSchema>
export type WithdrawClaimConversionCommand = z.infer<
  typeof withdrawClaimConversionSchema
>
export type StatusReceiptMutationCommand = z.infer<
  typeof statusReceiptMutationSchema
>
export type UpdatePublicMessageCommand = z.infer<
  typeof updatePublicMessageSchema
>
