import type { Payload, PayloadRequest } from 'payload'

import { assertCanManage } from '@/modules/identity-access/domain'
import {
  assertExpectedVersion,
  requireAccountManager,
} from '@/modules/identity-access/guards'
import { BusinessError } from '@/modules/shared/business-error'

import {
  memberAccountClaimOperations,
  setMemberAccountClaimOperation,
} from '../business-context'
import type { MemberClaimIdentityPort } from '../identity-port'
import type { MemberClaimAuditPort } from '../ports'
import type { DisableClaimCommand } from '../schemas'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'

export async function disableMemberClaimAccount(
  payload: Payload,
  req: PayloadRequest,
  accountId: string,
  input: {
    audit: MemberClaimAuditPort
    command: DisableClaimCommand
    identity: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
) {
  const actor = await requireAccountManager(payload, req, input.now)
  const initial = await input.identity.getClaimAccount(req, accountId)
  if (
    !initial ||
    !['pendingClaim', 'pendingApproval', 'claimBlocked'].includes(
      initial.status,
    )
  ) {
    throw new BusinessError('CONFLICT', 'Claim account has changed', 409)
  }
  assertExpectedVersion(
    initial.recordVersion,
    input.command.expectedAccountVersion,
  )
  assertCanManage(actor, accountId, initial.role, initial.role)
  const active = await payload.find({
    collection: 'account-claims',
    limit: 2,
    overrideAccess: true,
    req,
    where: {
      and: [
        { authUser: { equals: accountId } },
        { status: { equals: 'pendingReview' } },
      ],
    },
  })
  if (active.totalDocs > 1) {
    throw new BusinessError('CONFLICT', 'Multiple active claims found', 409)
  }
  const claim = active.docs[0]
  if (initial.status === 'pendingApproval' && !claim) {
    throw new BusinessError('CONFLICT', 'Active claim is missing', 409)
  }
  return withMemberClaimLocks(
    payload,
    {
      accountIds: [accountId],
      claimIds: claim ? [claim.id] : [],
    },
    () => {
      setMemberAccountClaimOperation(
        req.context,
        memberAccountClaimOperations.disableClaim,
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
        assertCanManage(actor, accountId, current.role, current.role)
        if (claim) {
          const lockedClaim = await payload.findByID({
            collection: 'account-claims',
            id: claim.id,
            overrideAccess: true,
            req,
          })
          if (lockedClaim.status !== 'pendingReview') {
            throw new BusinessError('CONFLICT', 'Active claim has changed', 409)
          }
          await payload.update({
            collection: 'account-claims',
            id: lockedClaim.id,
            data: {
              contacts: [],
              major: null,
              recordVersion: lockedClaim.recordVersion + 1,
              rejectionReason: 'policyOrEligibility',
              reviewedAt: input.now.toISOString(),
              reviewedBy: actor.id,
              status: 'rejected',
            },
            overrideAccess: false,
            req,
          })
        }
        const account = await input.identity.disableClaim(req, {
          accountId,
          expectedVersion: current.recordVersion,
        })
        await input.audit.append(req, {
          action: 'membership.account-claim.disabled',
          actorId: actor.id,
          metadata: {
            closedClaimId: claim?.id ?? null,
            reason: input.command.reason,
            status: 'disabled',
          },
          occurredAt: input.now,
          requestId: input.requestId,
          targetId: accountId,
          targetType: 'auth-user',
        })
        return {
          accountId,
          accountVersion: account.recordVersion,
          requestId: input.requestId,
          status: 'disabled' as const,
        }
      })
    },
  )
}
