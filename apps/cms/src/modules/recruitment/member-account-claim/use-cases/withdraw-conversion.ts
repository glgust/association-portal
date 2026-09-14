import { NotFound, type Payload, type PayloadRequest } from 'payload'

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
import type { WithdrawClaimConversionCommand } from '../schemas'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'
import { relationId } from './helpers'

export async function withdrawMemberClaimConversion(
  payload: Payload,
  req: PayloadRequest,
  claimId: string,
  input: {
    audit: MemberClaimAuditPort
    command: WithdrawClaimConversionCommand
    identity: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  let initial
  try {
    initial = await payload.findByID({
      collection: 'account-claims',
      id: claimId,
      overrideAccess: true,
      req,
    })
  } catch (error) {
    if (error instanceof NotFound) {
      throw new BusinessError('NOT_FOUND', 'Account claim not found', 404)
    }
    throw error
  }
  const accountId = relationId(initial.authUser)
  const memberId = relationId(initial.member)
  if (!accountId || !memberId) {
    throw new BusinessError('CONFLICT', 'Claim relation is unavailable', 409)
  }

  return withMemberClaimLocks(
    payload,
    { accountIds: [accountId], claimIds: [claimId], memberIds: [memberId] },
    () => {
      setMemberAccountClaimOperation(
        req.context,
        memberAccountClaimOperations.withdrawClaimConversion,
      )
      return inMemberAccountClaimTransaction(req, async () => {
        const claim = await payload.findByID({
          collection: 'account-claims',
          id: claimId,
          overrideAccess: true,
          req,
        })
        assertExpectedVersion(
          claim.recordVersion,
          input.command.expectedClaimVersion,
        )
        if (
          !claim.convertedAt ||
          claim.conversionWithdrawnAt ||
          relationId(claim.authUser) !== accountId ||
          relationId(claim.member) !== memberId
        ) {
          throw new BusinessError(
            'CONFLICT',
            'Claim conversion is not withdrawable',
            409,
          )
        }
        const account = await input.identity.getClaimAccount(req, accountId)
        if (!account || account.status !== 'pendingActivation') {
          throw new BusinessError(
            'CONFLICT',
            'Activated or changed accounts cannot withdraw conversion',
            409,
          )
        }
        assertExpectedVersion(
          account.recordVersion,
          input.command.expectedAccountVersion,
        )
        assertMemberClaimTarget(actor, accountId, account.role)
        const withdrawn = await input.identity.withdrawClaimConversion(req, {
          accountId,
          expectedVersion: account.recordVersion,
        })
        const updatedClaim = await payload.update({
          collection: 'account-claims',
          id: claimId,
          data: {
            conversionWithdrawnAt: input.now.toISOString(),
            conversionWithdrawnBy: actor.id,
            publicMessage:
              input.command.publicMessage ??
              publicMessageDefaults.conversionWithdrawn,
            publicMessageUpdatedAt: input.now.toISOString(),
            publicMessageUpdatedBy: actor.id,
            recordVersion: claim.recordVersion + 1,
          },
          overrideAccess: false,
          req,
        })
        await input.audit.append(req, {
          action: 'membership.account-claim.conversion-withdrawn',
          actorId: actor.id,
          metadata: { reason: input.command.reason, status: 'pendingClaim' },
          occurredAt: input.now,
          requestId: input.requestId,
          targetId: claimId,
          targetType: 'account-claim',
        })
        return {
          accountId,
          accountVersion: withdrawn.recordVersion,
          claimId,
          claimVersion: updatedClaim.recordVersion,
          requestId: input.requestId,
          status: 'pendingClaim' as const,
        }
      })
    },
  )
}
