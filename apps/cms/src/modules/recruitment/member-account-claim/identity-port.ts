import type { PayloadRequest } from 'payload'

export type PendingClaimAccountInput = {
  displayName: string
  loginName: string
  role: 'member' | 'staff' | 'cadre'
  studentNumber: string
}

export type PendingClaimAccountResult = {
  accountId: string
  recordVersion: number
}

/** Membership orchestrates; identity-access alone owns AuthUser credentials. */
export interface MemberClaimIdentityPort {
  createPendingClaimAccount(
    req: PayloadRequest,
    input: PendingClaimAccountInput,
  ): Promise<PendingClaimAccountResult>
  getClaimAccount(
    req: PayloadRequest,
    accountId: string,
  ): Promise<{
    authorizationSummary: Record<string, unknown>
    recordVersion: number
    role: 'member' | 'staff' | 'cadre' | 'admin' | 'owner'
    status: string
  } | null>
  submitClaimPassword(
    req: PayloadRequest,
    input: {
      accountId: string
      expectedVersion: number
      password: string
    },
  ): Promise<{ recordVersion: number }>
  approveClaim(
    req: PayloadRequest,
    input: { accountId: string; expectedVersion: number; now: Date },
  ): Promise<{ recordVersion: number }>
  rejectClaim(
    req: PayloadRequest,
    input: { accountId: string; expectedVersion: number; reason: string },
  ): Promise<{ recordVersion: number }>
  reopenClaim(
    req: PayloadRequest,
    input: { accountId: string; expectedVersion: number },
  ): Promise<{ recordVersion: number }>
  convertClaimToDirect(
    req: PayloadRequest,
    input: { accountId: string; expectedVersion: number; now: Date },
  ): Promise<{
    recordVersion: number
    temporaryCredential: string
    temporaryCredentialExpiresAt: string
  }>
  setPermissionOverride(
    req: PayloadRequest,
    input: {
      accountId: string
      effect: 'allow' | 'deny'
      expectedVersion: number
      expiresAt?: null | string
      now: Date
      permission: string
      reason: string
      recruitmentCycleId?: null | string
      requestId: string
      scopeType: 'global' | 'recruitmentCycle'
    },
  ): Promise<{ accountVersion: number; overrideId: string }>
  disableClaim(
    req: PayloadRequest,
    input: { accountId: string; expectedVersion: number },
  ): Promise<{ recordVersion: number }>
  withdrawClaimConversion(
    req: PayloadRequest,
    input: { accountId: string; expectedVersion: number },
  ): Promise<{ recordVersion: number }>
}
