import type { Payload } from 'payload'

import { auditOperations, setAuditOperation } from '@/modules/audit/context'
import {
  approveClaimAccount,
  convertClaimToPendingActivation,
  createPendingClaimAccount,
  disableClaimAccount,
  getClaimAccountSnapshot,
  rejectClaimAccount,
  reopenClaimAccount,
  submitClaimPassword,
  withdrawClaimConversionAccount,
} from '@/modules/identity-access/use-cases/account-claim'
import { setPermissionOverride } from '@/modules/identity-access/use-cases/permission-overrides'

import type { MemberClaimIdentityPort } from './identity-port'
import type { MemberClaimAuditPort } from './ports'

export function createMemberClaimIdentityPort(
  payload: Payload,
): MemberClaimIdentityPort {
  return {
    async createPendingClaimAccount(req, input) {
      const account = await createPendingClaimAccount(payload, req, input)
      return { accountId: account.id, recordVersion: account.recordVersion }
    },
    async getClaimAccount(req, accountId) {
      return getClaimAccountSnapshot(payload, req, accountId)
    },
    async submitClaimPassword(req, input) {
      const account = await submitClaimPassword(payload, req, {
        authUserId: input.accountId,
        expectedVersion: input.expectedVersion,
        password: input.password,
      })
      return { recordVersion: account.recordVersion }
    },
    async approveClaim(req, input) {
      const account = await approveClaimAccount(payload, req, {
        authUserId: input.accountId,
        expectedVersion: input.expectedVersion,
        now: input.now,
      })
      return { recordVersion: account.recordVersion }
    },
    async rejectClaim(req, input) {
      const account = await rejectClaimAccount(payload, req, {
        authUserId: input.accountId,
        expectedVersion: input.expectedVersion,
      })
      return { recordVersion: account.recordVersion }
    },
    async reopenClaim(req, input) {
      const account = await reopenClaimAccount(payload, req, {
        authUserId: input.accountId,
        expectedVersion: input.expectedVersion,
      })
      return { recordVersion: account.recordVersion }
    },
    async convertClaimToDirect(req, input) {
      const account = await convertClaimToPendingActivation(payload, req, {
        authUserId: input.accountId,
        expectedVersion: input.expectedVersion,
        now: input.now,
      })
      return {
        recordVersion: account.recordVersion,
        temporaryCredential: account.temporaryCredential,
        temporaryCredentialExpiresAt: account.temporaryCredentialExpiresAt,
      }
    },
    setPermissionOverride(req, input) {
      return setPermissionOverride(
        payload,
        req,
        input.accountId,
        {
          effect: input.effect,
          expectedVersion: input.expectedVersion,
          expiresAt: input.expiresAt,
          permission: input.permission,
          reason: input.reason,
          recruitmentCycleId: input.recruitmentCycleId,
          scopeType: input.scopeType,
        },
        { now: input.now, requestId: input.requestId },
      )
    },
    async disableClaim(req, input) {
      const account = await disableClaimAccount(payload, req, {
        authUserId: input.accountId,
        expectedVersion: input.expectedVersion,
      })
      return { recordVersion: account.recordVersion }
    },
    async withdrawClaimConversion(req, input) {
      const account = await withdrawClaimConversionAccount(payload, req, {
        authUserId: input.accountId,
        expectedVersion: input.expectedVersion,
      })
      return { recordVersion: account.recordVersion }
    },
  }
}

const auditOperationByAction = {
  'membership.account-claim.approved': auditOperations.approveAccountClaim,
  'membership.account-claim.converted-to-direct':
    auditOperations.convertClaimToDirect,
  'membership.account-claim.conversion-withdrawn':
    auditOperations.withdrawClaimConversion,
  'membership.account-claim.disabled': auditOperations.disableAccount,
  'membership.account-claim.preconfigured':
    auditOperations.preconfigureAccountClaim,
  'membership.account-claim.rejected': auditOperations.rejectAccountClaim,
  'membership.account-claim.reopened': auditOperations.reopenAccountClaim,
  'membership.account-claim.submitted': auditOperations.submitAccountClaim,
  'membership.public-message.updated': auditOperations.updatePublicMessage,
  'membership.status-receipt.reissued': auditOperations.reissueStatusReceipt,
  'membership.intake.approved': auditOperations.approveMemberIntake,
  'membership.intake.rejected': auditOperations.rejectMemberIntake,
  'membership.intake.submitted': auditOperations.submitMemberIntake,
} as const

export function createMemberClaimAuditPort(
  payload: Payload,
): MemberClaimAuditPort {
  return {
    async append(req, event) {
      const operation =
        auditOperationByAction[
          event.action as keyof typeof auditOperationByAction
        ]
      if (!operation) throw new Error('Unsupported membership audit action')
      setAuditOperation(req.context, operation)
      await payload.create({
        collection: 'audit-events',
        data: {
          action: event.action,
          actor: event.actorId,
          metadata: event.metadata,
          occurredAt: event.occurredAt.toISOString(),
          requestId: event.requestId,
          result: 'success',
          targetId: event.targetId,
          targetType: event.targetType,
        },
        overrideAccess: false,
        req,
      })
    },
  }
}
