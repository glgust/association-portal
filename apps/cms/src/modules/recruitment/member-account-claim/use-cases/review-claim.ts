import { NotFound, type Payload, type PayloadRequest } from 'payload'

import { assertExpectedVersion } from '@/modules/identity-access/guards'
import { BusinessError } from '@/modules/shared/business-error'

import {
  memberAccountClaimOperations,
  setMemberAccountClaimOperation,
} from '../business-context'
import { assertReviewTransition, type ContactInput } from '../domain'
import { assertMemberClaimTarget, requireMemberClaimManager } from '../guards'
import type { MemberClaimIdentityPort } from '../identity-port'
import type { MemberClaimAuditPort } from '../ports'
import { publicMessageDefaults } from '../public-messages'
import type { RejectClaimCommand, ReviewClaimCommand } from '../schemas'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'
import { relationId } from './helpers'

type ClaimDocument = {
  authUser: string | { id: string }
  authorizationSummary: unknown
  contacts?: ContactInput[] | null
  id: string
  major?: null | string
  member: string | { id: string }
  recordVersion: number
  status: 'approved' | 'pendingReview' | 'rejected'
}

function requiredRelationId(
  value: null | string | { id: string } | undefined,
): string {
  const id = relationId(value)
  if (!id) throw new BusinessError('CONFLICT', 'Claim relation is missing', 409)
  return id
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function findClaim(
  payload: Payload,
  req: PayloadRequest,
  claimId: string,
): Promise<ClaimDocument> {
  try {
    return (await payload.findByID({
      collection: 'account-claims',
      id: claimId,
      overrideAccess: true,
      req,
    })) as unknown as ClaimDocument
  } catch (error) {
    if (error instanceof NotFound) {
      throw new BusinessError('NOT_FOUND', 'Account claim not found', 404)
    }
    throw error
  }
}

export async function approveAccountClaim(
  payload: Payload,
  req: PayloadRequest,
  claimId: string,
  input: {
    audit: MemberClaimAuditPort
    command: ReviewClaimCommand
    identity: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  const initial = await findClaim(payload, req, claimId)
  const accountId = requiredRelationId(initial.authUser)
  const memberId = requiredRelationId(initial.member)
  return withMemberClaimLocks(
    payload,
    {
      accountIds: [accountId],
      claimIds: [claimId],
      memberIds: [memberId],
    },
    () => {
      setMemberAccountClaimOperation(
        req.context,
        memberAccountClaimOperations.approveClaim,
      )
      return inMemberAccountClaimTransaction(req, async () => {
        const claim = await findClaim(payload, req, claimId)
        if (requiredRelationId(claim.authUser) !== accountId) {
          throw new BusinessError('CONFLICT', 'Claim account has changed', 409)
        }
        assertReviewTransition(claim.status, 'approved')
        assertExpectedVersion(
          claim.recordVersion,
          input.command.expectedClaimVersion,
        )
        const account = await input.identity.getClaimAccount(req, accountId)
        if (!account || account.status !== 'pendingApproval') {
          throw new BusinessError('CONFLICT', 'Claim account has changed', 409)
        }
        assertExpectedVersion(
          account.recordVersion,
          input.command.expectedAccountVersion,
        )
        assertMemberClaimTarget(actor, accountId, account.role)
        if (
          canonical(claim.authorizationSummary) !==
            canonical(account.authorizationSummary) &&
          !input.command.confirmCurrentAuthorization
        ) {
          throw new BusinessError(
            'CONFLICT',
            'Authorization changed; refresh and confirm current configuration',
            409,
          )
        }
        await input.identity.approveClaim(req, {
          accountId,
          expectedVersion: account.recordVersion,
          now: input.now,
        })
        if (requiredRelationId(claim.member) !== memberId) {
          throw new BusinessError('CONFLICT', 'Claim member has changed', 409)
        }
        const member = await payload.findByID({
          collection: 'members',
          id: memberId,
          overrideAccess: true,
          req,
        })
        await payload.update({
          collection: 'members',
          id: memberId,
          data: {
            contacts: claim.contacts ?? [],
            major: claim.major || member.major || null,
            recordVersion: (member.recordVersion ?? 1) + 1,
          },
          overrideAccess: false,
          req,
        })
        const updated = await payload.update({
          collection: 'account-claims',
          id: claim.id,
          data: {
            contacts: [],
            major: null,
            publicMessage:
              input.command.publicMessage ??
              publicMessageDefaults.claimApproved,
            publicMessageUpdatedAt: input.now.toISOString(),
            publicMessageUpdatedBy: actor.id,
            recordVersion: claim.recordVersion + 1,
            reviewedAt: input.now.toISOString(),
            reviewedBy: actor.id,
            status: 'approved',
          },
          overrideAccess: false,
          req,
        })
        await input.audit.append(req, {
          action: 'membership.account-claim.approved',
          actorId: actor.id,
          metadata: { role: account.role, status: 'approved' },
          occurredAt: input.now,
          requestId: input.requestId,
          targetId: claim.id,
          targetType: 'account-claim',
        })
        return {
          accountVersion: account.recordVersion + 1,
          claimId: updated.id,
          recordVersion: updated.recordVersion,
          requestId: input.requestId,
          status: 'approved' as const,
        }
      })
    },
  )
}

export async function rejectAccountClaim(
  payload: Payload,
  req: PayloadRequest,
  claimId: string,
  input: {
    audit: MemberClaimAuditPort
    command: RejectClaimCommand
    identity: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  const initial = await findClaim(payload, req, claimId)
  const accountId = requiredRelationId(initial.authUser)
  const memberId = requiredRelationId(initial.member)
  return withMemberClaimLocks(
    payload,
    {
      accountIds: [accountId],
      claimIds: [claimId],
      memberIds: [memberId],
    },
    () => {
      setMemberAccountClaimOperation(
        req.context,
        memberAccountClaimOperations.rejectClaim,
      )
      return inMemberAccountClaimTransaction(req, async () => {
        const claim = await findClaim(payload, req, claimId)
        if (requiredRelationId(claim.authUser) !== accountId) {
          throw new BusinessError('CONFLICT', 'Claim account has changed', 409)
        }
        if (requiredRelationId(claim.member) !== memberId) {
          throw new BusinessError('CONFLICT', 'Claim member has changed', 409)
        }
        assertReviewTransition(claim.status, 'rejected')
        assertExpectedVersion(
          claim.recordVersion,
          input.command.expectedClaimVersion,
        )
        const account = await input.identity.getClaimAccount(req, accountId)
        if (!account || account.status !== 'pendingApproval') {
          throw new BusinessError('CONFLICT', 'Claim account has changed', 409)
        }
        assertExpectedVersion(
          account.recordVersion,
          input.command.expectedAccountVersion,
        )
        assertMemberClaimTarget(actor, accountId, account.role)
        await input.identity.rejectClaim(req, {
          accountId,
          expectedVersion: account.recordVersion,
          reason: input.command.reason,
        })
        const updated = await payload.update({
          collection: 'account-claims',
          id: claim.id,
          data: {
            contacts: [],
            major: null,
            publicMessage:
              input.command.publicMessage ??
              publicMessageDefaults.claimRejected,
            publicMessageUpdatedAt: input.now.toISOString(),
            publicMessageUpdatedBy: actor.id,
            recordVersion: claim.recordVersion + 1,
            rejectionReason: input.command.reason,
            reviewedAt: input.now.toISOString(),
            reviewedBy: actor.id,
            status: 'rejected',
          },
          overrideAccess: false,
          req,
        })
        await input.audit.append(req, {
          action: 'membership.account-claim.rejected',
          actorId: actor.id,
          metadata: {
            reason: input.command.reason,
            status: 'rejected',
          },
          occurredAt: input.now,
          requestId: input.requestId,
          targetId: claim.id,
          targetType: 'account-claim',
        })
        return {
          accountVersion: account.recordVersion + 1,
          claimId: updated.id,
          recordVersion: updated.recordVersion,
          requestId: input.requestId,
          status: 'rejected' as const,
        }
      })
    },
  )
}
