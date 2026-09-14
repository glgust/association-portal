import type { Payload, PayloadRequest } from 'payload'

import { assertExpectedVersion } from '@/modules/identity-access/guards'
import { BusinessError } from '@/modules/shared/business-error'

import {
  memberAccountClaimOperations,
  setMemberAccountClaimOperation,
} from '../business-context'
import { assertMemberClaimTarget, requireMemberClaimManager } from '../guards'
import type { MemberClaimIdentityPort } from '../identity-port'
import type { MemberClaimAuditPort } from '../ports'
import type { ConvertClaimToDirectCommand } from '../schemas'
import { publicMessageDefaults } from '../public-messages'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'
import { relationId } from './helpers'

export async function convertMemberClaimToDirect(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  input: {
    audit: MemberClaimAuditPort
    command: ConvertClaimToDirectCommand
    identity: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  const [initialAccount, claim] = await Promise.all([
    input.identity.getClaimAccount(req, accountId),
    payload.findByID({
      collection: 'account-claims',
      id: input.command.claimId,
      overrideAccess: true,
      req,
    }),
  ])
  if (
    !initialAccount ||
    !['pendingClaim', 'pendingApproval', 'claimBlocked'].includes(
      initialAccount.status,
    )
  ) {
    throw new BusinessError('CONFLICT', 'Claim account has changed', 409)
  }
  assertExpectedVersion(
    initialAccount.recordVersion,
    input.command.expectedAccountVersion,
  )
  assertMemberClaimTarget(actor, accountId, initialAccount.role)
  if (
    relationId(claim.authUser) !== accountId ||
    !['pendingReview', 'rejected'].includes(claim.status) ||
    claim.convertedAt ||
    claim.conversionWithdrawnAt
  ) {
    throw new BusinessError(
      'CONFLICT',
      'The selected claim is not eligible for this account conversion',
      409,
    )
  }
  assertExpectedVersion(claim.recordVersion, input.command.expectedClaimVersion)
  const memberId = relationId(claim.member)
  if (!memberId)
    throw new BusinessError('CONFLICT', 'Claim member is missing', 409)

  return withMemberClaimLocks(
    payload,
    {
      accountIds: [accountId],
      claimIds: [claim.id],
      memberIds: [memberId],
    },
    () => {
      setMemberAccountClaimOperation(
        req.context,
        memberAccountClaimOperations.convertClaimToDirect,
      )
      return inMemberAccountClaimTransaction(req, async () => {
        const current = await input.identity.getClaimAccount(req, accountId)
        if (
          !current ||
          !['pendingClaim', 'pendingApproval', 'claimBlocked'].includes(
            current.status,
          )
        ) {
          throw new BusinessError('CONFLICT', 'Claim account has changed', 409)
        }
        assertExpectedVersion(
          current.recordVersion,
          input.command.expectedAccountVersion,
        )
        assertMemberClaimTarget(actor, accountId, current.role)
        const lockedClaim = await payload.findByID({
          collection: 'account-claims',
          id: claim.id,
          overrideAccess: true,
          req,
        })
        if (
          relationId(lockedClaim.authUser) !== accountId ||
          !['pendingReview', 'rejected'].includes(lockedClaim.status) ||
          lockedClaim.convertedAt ||
          lockedClaim.conversionWithdrawnAt ||
          relationId(lockedClaim.member) !== memberId
        ) {
          throw new BusinessError('CONFLICT', 'Claim has changed', 409)
        }
        const lockedMember = await payload.findByID({
          collection: 'members',
          id: memberId,
          overrideAccess: true,
          req,
        })
        if (relationId(lockedMember.authUser) !== accountId) {
          throw new BusinessError(
            'CONFLICT',
            'Claim, account, and member relations have changed',
            409,
          )
        }
        assertExpectedVersion(
          lockedClaim.recordVersion,
          input.command.expectedClaimVersion,
        )
        const converted = await input.identity.convertClaimToDirect(req, {
          accountId,
          expectedVersion: current.recordVersion,
          now: input.now,
        })
        const wasPending = lockedClaim.status === 'pendingReview'
        const updatedClaim = await payload.update({
          collection: 'account-claims',
          id: lockedClaim.id,
          data: {
            ...(wasPending
              ? {
                  contacts: [],
                  major: null,
                  rejectionReason: input.command.reason,
                  reviewedAt: input.now.toISOString(),
                  reviewedBy: actor.id,
                  status: 'rejected' as const,
                }
              : {}),
            convertedAccountVersion: converted.recordVersion,
            convertedAt: input.now.toISOString(),
            publicMessage:
              input.command.publicMessage ??
              publicMessageDefaults.claimConverted,
            publicMessageUpdatedAt: input.now.toISOString(),
            publicMessageUpdatedBy: actor.id,
            recordVersion: lockedClaim.recordVersion + 1,
          },
          overrideAccess: false,
          req,
        })
        await input.audit.append(req, {
          action: 'membership.account-claim.converted-to-direct',
          actorId: actor.id,
          metadata: {
            closedClaimId: input.command.claimId,
            reason: input.command.reason,
            status: 'pendingActivation',
          },
          occurredAt: input.now,
          requestId: input.requestId,
          targetId: accountId,
          targetType: 'auth-user',
        })
        return {
          accountId,
          accountVersion: converted.recordVersion,
          claimId: input.command.claimId,
          claimVersion: updatedClaim.recordVersion,
          requestId: input.requestId,
          status: 'pendingActivation' as const,
          temporaryCredential: converted.temporaryCredential,
          temporaryCredentialExpiresAt: converted.temporaryCredentialExpiresAt,
        }
      })
    },
  )
}
