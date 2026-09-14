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
import { publicMessageDefaults } from '../public-messages'
import type { ReopenClaimCommand } from '../schemas'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'

export async function reopenMemberAccountClaim(
  payload: Payload,
  req: PayloadRequest,
  input: {
    accountId: string
    audit: MemberClaimAuditPort
    command: ReopenClaimCommand
    identity: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  const matches = await payload.find({
    collection: 'account-claims',
    limit: 1,
    overrideAccess: true,
    req,
    sort: '-reviewedAt',
    where: {
      and: [
        { authUser: { equals: input.accountId } },
        { status: { equals: 'rejected' } },
      ],
    },
  })
  const claim = matches.docs[0]
  if (!claim)
    throw new BusinessError('CONFLICT', 'Rejected claim is unavailable', 409)
  assertExpectedVersion(claim.recordVersion, input.command.expectedClaimVersion)
  return withMemberClaimLocks(
    payload,
    { accountIds: [input.accountId], claimIds: [claim.id] },
    () => {
      setMemberAccountClaimOperation(
        req.context,
        memberAccountClaimOperations.reopenClaim,
      )
      return inMemberAccountClaimTransaction(req, async () => {
        const current = await input.identity.getClaimAccount(
          req,
          input.accountId,
        )
        if (!current || current.status !== 'claimBlocked') {
          throw new BusinessError('CONFLICT', 'Claim account has changed', 409)
        }
        assertExpectedVersion(
          current.recordVersion,
          input.command.expectedAccountVersion,
        )
        assertMemberClaimTarget(actor, input.accountId, current.role)
        const lockedClaim = await payload.findByID({
          collection: 'account-claims',
          id: claim.id,
          overrideAccess: true,
          req,
        })
        if (lockedClaim.status !== 'rejected') {
          throw new BusinessError('CONFLICT', 'Rejected claim has changed', 409)
        }
        assertExpectedVersion(
          lockedClaim.recordVersion,
          input.command.expectedClaimVersion,
        )
        const account = await input.identity.reopenClaim(req, {
          accountId: input.accountId,
          expectedVersion: current.recordVersion,
        })
        const updatedClaim = await payload.update({
          collection: 'account-claims',
          id: lockedClaim.id,
          data: {
            publicMessage:
              input.command.publicMessage ??
              publicMessageDefaults.claimReopened,
            publicMessageUpdatedAt: input.now.toISOString(),
            publicMessageUpdatedBy: actor.id,
            recordVersion: lockedClaim.recordVersion + 1,
          },
          overrideAccess: false,
          req,
        })
        await input.audit.append(req, {
          action: 'membership.account-claim.reopened',
          actorId: actor.id,
          metadata: {
            reason: input.command.reason,
            status: 'pendingClaim',
          },
          occurredAt: input.now,
          requestId: input.requestId,
          targetId: input.accountId,
          targetType: 'auth-user',
        })
        return {
          accountId: input.accountId,
          accountVersion: account.recordVersion,
          claimId: updatedClaim.id,
          claimVersion: updatedClaim.recordVersion,
          requestId: input.requestId,
          status: 'pendingClaim' as const,
        }
      })
    },
  )
}
