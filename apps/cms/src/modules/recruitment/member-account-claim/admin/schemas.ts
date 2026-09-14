import { z } from 'zod'

import { claimRejectionReasons, membershipIdentities } from '../domain'

const authorizationSchema = z
  .object({
    defaultPermissions: z.array(z.string()),
    overrides: z.array(
      z
        .object({
          effect: z.enum(['allow', 'deny']),
          permission: z.string(),
          scopeLabel: z.string(),
        })
        .strict(),
    ),
    role: z.enum(['member', 'staff', 'cadre', 'admin']),
  })
  .strict()

export const reviewActionFactsSchema = z
  .object({
    canApprove: z.boolean(),
    canConvertToDirect: z.boolean(),
    canReject: z.boolean(),
    canReissueStatusReceipt: z.boolean(),
    canReissueTemporaryCredential: z.boolean(),
    canReopen: z.boolean(),
    canUpdatePublicMessage: z.boolean(),
    canWithdrawConversion: z.boolean(),
  })
  .strict()

export const processedFilterSchema = z.enum(['all', 'followUp'])
export const queueQuerySchema = z
  .object({
    processedCursor: z.string().max(500).optional(),
    processedFilter: processedFilterSchema.default('all'),
  })
  .strict()

export const queueItemSchema = z
  .object({
    accountId: z.string().nullable(),
    applicantIdentity: z.enum(membershipIdentities),
    associationIdentity: z.enum(membershipIdentities).nullable(),
    canReopen: z.boolean(),
    id: z.string(),
    kind: z.enum(['claim', 'intake']),
    recordVersion: z.number().int().positive(),
    status: z.enum(['pendingReview', 'approved', 'rejected']),
    submittedAt: z.string(),
  })
  .strict()
export const queueResultSchema = z
  .object({
    items: z.array(queueItemSchema),
    processed: z.array(
      z
        .object({
          accountId: z.string().uuid().nullable(),
          accountRecordVersion: z.number().int().positive().nullable(),
          actions: reviewActionFactsSchema,
          id: z.string().uuid(),
          kind: z.enum(['claim', 'intake']),
          processedAt: z.string(),
          processedBy: z.string(),
          productStatus: z.string(),
          publicMessageSummary: z.string().max(80).nullable(),
          recordVersion: z.number().int().positive(),
        })
        .strict(),
    ),
    processedNextCursor: z.string().max(500).nullable(),
  })
  .strict()
export const reviewDetailSchema = z
  .object({
    accountId: z.string().nullable(),
    accountRecordVersion: z.number().int().positive().nullable(),
    accountStatus: z
      .enum([
        'pendingActivation',
        'pendingClaim',
        'pendingApproval',
        'claimBlocked',
        'active',
        'disabled',
      ])
      .nullable(),
    applicantIdentity: z.enum(membershipIdentities),
    actions: reviewActionFactsSchema,
    associationIdentity: z.enum(membershipIdentities).nullable(),
    authorization: authorizationSchema.nullable(),
    authorizationAtSubmission: authorizationSchema.nullable(),
    contacts: z.array(
      z
        .object({
          isPrimary: z.boolean(),
          label: z.string().nullable(),
          type: z.enum(['phone', 'wechat', 'qq', 'other']),
          value: z.string(),
        })
        .strict(),
    ),
    id: z.string(),
    kind: z.enum(['claim', 'intake']),
    convertedAt: z.string().nullable(),
    conversionWithdrawnAt: z.string().nullable(),
    major: z.string().nullable(),
    memberId: z.string().nullable(),
    name: z.string(),
    publicMessage: z.string().nullable(),
    recordVersion: z.number().int().positive(),
    stale: z.boolean(),
    status: z.enum(['pendingReview', 'approved', 'rejected']),
    studentNumber: z.string().nullable(),
    submittedAt: z.string(),
  })
  .strict()
export const mutationResultSchema = z
  .object({ updated: z.literal(true) })
  .strict()
export const directConversionResultSchema = z
  .object({
    temporaryCredential: z.string(),
    temporaryCredentialExpiresAt: z.string(),
  })
  .strict()
export const statusReceiptResultSchema = z
  .object({
    recordVersion: z.number().int().positive(),
    statusReceipt: z.string().min(80).max(1000),
    statusReceiptExpiresAt: z.string().datetime(),
  })
  .strict()
export const versionedMutationResultSchema = z
  .object({ recordVersion: z.number().int().positive() })
  .strict()
export const conversionWithdrawalResultSchema = z
  .object({
    accountId: z.string().uuid(),
    accountVersion: z.number().int().positive(),
    claimId: z.string().uuid(),
    claimVersion: z.number().int().positive(),
    requestId: z.string(),
    status: z.literal('pendingClaim'),
  })
  .strict()
export const rejectionReasonSchema = z.enum(claimRejectionReasons)
export type QueueItem = z.infer<typeof queueItemSchema>
export type ProcessedItem = z.infer<
  typeof queueResultSchema
>['processed'][number]
export type ReviewDetail = z.infer<typeof reviewDetailSchema>
export type RejectionReason = z.infer<typeof rejectionReasonSchema>

const base = '/api/v1/admin/member-account-claims'
export const adminClaimApi = {
  queue: base,
  preconfigure: `${base}/preconfigure`,
  claimDetail: (id: string) => `${base}/claims/${encodeURIComponent(id)}`,
  intakeDetail: (id: string) =>
    `${base}/intake-applications/${encodeURIComponent(id)}`,
  approveClaim: (id: string) =>
    `${base}/claims/${encodeURIComponent(id)}/approve`,
  rejectClaim: (id: string) =>
    `${base}/claims/${encodeURIComponent(id)}/reject`,
  approveIntake: (id: string) =>
    `${base}/intake-applications/${encodeURIComponent(id)}/approve`,
  rejectIntake: (id: string) =>
    `${base}/intake-applications/${encodeURIComponent(id)}/reject`,
  reopen: (id: string) => `${base}/accounts/${encodeURIComponent(id)}/reopen`,
  convert: (id: string) =>
    `${base}/accounts/${encodeURIComponent(id)}/convert-to-direct`,
  withdrawConversion: (id: string) =>
    `${base}/claims/${encodeURIComponent(id)}/withdraw-conversion`,
  claimStatusReceipt: (id: string) =>
    `${base}/claims/${encodeURIComponent(id)}/status-receipt`,
  intakeStatusReceipt: (id: string) =>
    `${base}/intake-applications/${encodeURIComponent(id)}/status-receipt`,
  claimPublicMessage: (id: string) =>
    `${base}/claims/${encodeURIComponent(id)}/public-message`,
  intakePublicMessage: (id: string) =>
    `${base}/intake-applications/${encodeURIComponent(id)}/public-message`,
  reissueTemporaryCredential: (id: string) =>
    `/api/v1/admin/accounts/${encodeURIComponent(id)}/reissue`,
} as const
