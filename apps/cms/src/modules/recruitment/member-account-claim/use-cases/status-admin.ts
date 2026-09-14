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
import type {
  StatusReceiptMutationCommand,
  UpdatePublicMessageCommand,
} from '../schemas'
import { issueStatusReceipt } from '../status-receipt'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'
import { relationId } from './helpers'

type StatusRecordKind = 'claim' | 'intake'
export const terminalStatusReceiptLifetimeMs = 30 * 24 * 60 * 60 * 1000

export function canReissueMembershipStatusReceipt(
  record: { reviewedAt?: null | string; status: string },
  now: Date,
) {
  if (record.status !== 'approved' && record.status !== 'rejected') return false
  if (!record.reviewedAt) return false
  const reviewedAt = Date.parse(record.reviewedAt)
  return (
    Number.isFinite(reviewedAt) &&
    now.getTime() - reviewedAt <= terminalStatusReceiptLifetimeMs
  )
}

export function membershipStatusReceiptExpiresAt(record: {
  reviewedAt?: null | string
  status: string
}): string | null {
  if (
    (record.status !== 'approved' && record.status !== 'rejected') ||
    !record.reviewedAt
  ) {
    return null
  }
  const reviewedAt = Date.parse(record.reviewedAt)
  return Number.isFinite(reviewedAt)
    ? new Date(reviewedAt + terminalStatusReceiptLifetimeMs).toISOString()
    : null
}

function lockResources(kind: StatusRecordKind, id: string) {
  return kind === 'claim' ? { claimIds: [id] } : { intakeIds: [id] }
}

async function claimOperationLock(
  payload: Payload,
  req: PayloadRequest,
  kind: StatusRecordKind,
  id: string,
) {
  if (kind === 'intake')
    return { accountId: null, resources: lockResources(kind, id) }
  const current = await findRecord(payload, req, kind, id)
  const accountId = 'authUser' in current ? relationId(current.authUser) : null
  if (!accountId) {
    throw new BusinessError(
      'CONFLICT',
      'Claim account relation is unavailable',
      409,
    )
  }
  return {
    accountId,
    resources: { accountIds: [accountId], claimIds: [id] },
  }
}

async function assertClaimOperationTarget(
  req: PayloadRequest,
  actor: Awaited<ReturnType<typeof requireMemberClaimManager>>,
  kind: StatusRecordKind,
  current: Awaited<ReturnType<typeof findRecord>>,
  accountId: null | string,
  identity?: MemberClaimIdentityPort,
) {
  if (kind === 'intake') return
  const currentAccountId =
    'authUser' in current ? relationId(current.authUser) : null
  if (!accountId || currentAccountId !== accountId || !identity) {
    throw new BusinessError(
      'CONFLICT',
      'Claim account relation has changed',
      409,
    )
  }
  const account = await identity.getClaimAccount(req, accountId)
  if (!account) {
    throw new BusinessError('CONFLICT', 'Claim account is unavailable', 409)
  }
  assertMemberClaimTarget(actor, accountId, account.role)
}

async function findRecord(
  payload: Payload,
  req: PayloadRequest,
  kind: StatusRecordKind,
  id: string,
) {
  return kind === 'claim'
    ? payload.findByID({
        collection: 'account-claims',
        id,
        overrideAccess: true,
        req,
      })
    : payload.findByID({
        collection: 'member-intake-applications',
        id,
        overrideAccess: true,
        req,
      })
}

export async function updateMembershipPublicMessage(
  payload: Payload,
  req: PayloadRequest,
  kind: StatusRecordKind,
  id: string,
  input: {
    audit: MemberClaimAuditPort
    command: UpdatePublicMessageCommand
    identity?: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  const lock = await claimOperationLock(payload, req, kind, id)
  return withMemberClaimLocks(payload, lock.resources, () => {
    setMemberAccountClaimOperation(
      req.context,
      memberAccountClaimOperations.updatePublicMessage,
    )
    return inMemberAccountClaimTransaction(req, async () => {
      const current = await findRecord(payload, req, kind, id)
      await assertClaimOperationTarget(
        req,
        actor,
        kind,
        current,
        lock.accountId,
        input.identity,
      )
      assertExpectedVersion(
        current.recordVersion,
        input.command.expectedVersion,
      )
      const data = {
        publicMessage: input.command.publicMessage,
        publicMessageUpdatedAt: input.now.toISOString(),
        publicMessageUpdatedBy: actor.id,
        recordVersion: current.recordVersion + 1,
      }
      const updated =
        kind === 'claim'
          ? await payload.update({
              collection: 'account-claims',
              data,
              id,
              overrideAccess: false,
              req,
            })
          : await payload.update({
              collection: 'member-intake-applications',
              data,
              id,
              overrideAccess: false,
              req,
            })
      await input.audit.append(req, {
        action: 'membership.public-message.updated',
        actorId: actor.id,
        metadata: {
          category: 'managerPublicMessage',
          length: input.command.publicMessage.length,
          reasonCategory: 'managerRequested',
        },
        occurredAt: input.now,
        requestId: input.requestId,
        targetId: id,
        targetType: kind === 'claim' ? 'account-claim' : 'member-intake',
      })
      return { recordVersion: updated.recordVersion }
    })
  })
}

export async function reissueMembershipStatusReceipt(
  payload: Payload,
  req: PayloadRequest,
  kind: StatusRecordKind,
  id: string,
  input: {
    audit: MemberClaimAuditPort
    command: StatusReceiptMutationCommand
    identity?: MemberClaimIdentityPort
    now: Date
    receiptKey: string | Uint8Array
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  const lock = await claimOperationLock(payload, req, kind, id)
  return withMemberClaimLocks(payload, lock.resources, () => {
    setMemberAccountClaimOperation(
      req.context,
      memberAccountClaimOperations.reissueStatusReceipt,
    )
    return inMemberAccountClaimTransaction(req, async () => {
      const current = await findRecord(payload, req, kind, id)
      await assertClaimOperationTarget(
        req,
        actor,
        kind,
        current,
        lock.accountId,
        input.identity,
      )
      assertExpectedVersion(
        current.recordVersion,
        input.command.expectedVersion,
      )
      if (!canReissueMembershipStatusReceipt(current, input.now)) {
        throw new BusinessError(
          'CONFLICT',
          'Status receipt can only be reissued for a recent processed record',
          409,
        )
      }
      const statusReceiptExpiresAt = membershipStatusReceiptExpiresAt(current)
      if (!statusReceiptExpiresAt) {
        throw new BusinessError(
          'CONFLICT',
          'Status receipt expiry is unavailable',
          409,
        )
      }
      const issuedAt = input.now.toISOString()
      const statusAccessVersion = current.statusAccessVersion + 1
      const data = {
        recordVersion: current.recordVersion + 1,
        statusAccessIssuedAt: issuedAt,
        statusAccessVersion,
      }
      const updated =
        kind === 'claim'
          ? await payload.update({
              collection: 'account-claims',
              data,
              id,
              overrideAccess: false,
              req,
            })
          : await payload.update({
              collection: 'member-intake-applications',
              data,
              id,
              overrideAccess: false,
              req,
            })
      await input.audit.append(req, {
        action: 'membership.status-receipt.reissued',
        actorId: actor.id,
        metadata: {
          reasonCategory: 'managerRequested',
          statusAccessVersion,
        },
        occurredAt: input.now,
        requestId: input.requestId,
        targetId: id,
        targetType: kind === 'claim' ? 'account-claim' : 'member-intake',
      })
      return {
        recordVersion: updated.recordVersion,
        statusReceipt: issueStatusReceipt(input.receiptKey, {
          id,
          issuedAt,
          kind,
          version: statusAccessVersion,
        }),
        statusReceiptExpiresAt,
      }
    })
  })
}
