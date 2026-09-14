import type { Payload, PayloadRequest } from 'payload'

import { BusinessError } from '@/modules/shared/business-error'

import {
  memberAccountClaimOperations,
  setMemberAccountClaimOperation,
} from '../business-context'
import { keyedRequestFingerprint } from '../fingerprint'
import type { MemberClaimAuditPort } from '../ports'
import type { SubmitIntakeCommand } from '../schemas'
import { issueStatusReceipt } from '../status-receipt'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'
import { normalizedProfile } from './helpers'

function requireStatusReceiptIssuedAt(value: null | string | undefined) {
  if (!value) {
    throw new BusinessError(
      'CONFLICT',
      'This historical submission requires a manager-issued status receipt',
      409,
    )
  }
  return value
}

const statusReceiptNotice =
  '请立即保存此查询凭证；它只显示在本次成功结果中，不可用于登录或修改申请。'

export async function submitMemberIntake(
  payload: Payload,
  req: PayloadRequest,
  input: {
    audit: MemberClaimAuditPort
    command: SubmitIntakeCommand
    fingerprintKey: string | Uint8Array
    idempotencyKey: string
    now: Date
    requestId: string
  },
) {
  const profile = normalizedProfile(input.command)
  const fingerprint = keyedRequestFingerprint(input.fingerprintKey, 'intake', {
    contacts: profile.contacts,
    major: profile.major,
    membershipIdentity: input.command.membershipIdentity,
    name: profile.name,
    privacyPurposeConfirmed: true,
    studentNumber: profile.studentNumber,
  })
  return withMemberClaimLocks(
    payload,
    { idempotencyKeys: [`intake:${input.idempotencyKey}`] },
    async () => {
      const replay = await payload.find({
        collection: 'member-intake-applications',
        limit: 1,
        overrideAccess: true,
        req,
        where: { idempotencyKey: { equals: input.idempotencyKey } },
      })
      if (replay.docs[0]) {
        if (replay.docs[0].requestFingerprint !== fingerprint) {
          throw new BusinessError(
            'CONFLICT',
            'Idempotency key was already used',
            409,
          )
        }
        return {
          intakeId: replay.docs[0].id,
          requestId: replay.docs[0].requestId,
          status: 'pendingReview' as const,
          statusReceipt: issueStatusReceipt(input.fingerprintKey, {
            id: replay.docs[0].id,
            issuedAt: requireStatusReceiptIssuedAt(
              replay.docs[0].statusAccessIssuedAt,
            ),
            kind: 'intake',
            version: replay.docs[0].statusAccessVersion,
          }),
          statusReceiptNotice,
          submittedAt: replay.docs[0].submittedAt,
        }
      }

      setMemberAccountClaimOperation(
        req.context,
        memberAccountClaimOperations.submitIntake,
      )
      return inMemberAccountClaimTransaction(req, async () => {
        const intake = await payload.create({
          collection: 'member-intake-applications',
          data: {
            applicantIdentity: input.command.membershipIdentity,
            contacts: profile.contacts,
            idempotencyKey: input.idempotencyKey,
            major: profile.major,
            name: profile.name,
            privacyPurposeConfirmed: true,
            recordVersion: 1,
            requestFingerprint: fingerprint,
            requestId: input.requestId,
            status: 'pendingReview',
            statusAccessIssuedAt: input.now.toISOString(),
            statusAccessVersion: 1,
            studentNumber: profile.studentNumber,
            submittedAt: input.now.toISOString(),
          },
          overrideAccess: false,
          req,
        })
        await input.audit.append(req, {
          action: 'membership.intake.submitted',
          metadata: { status: 'pendingReview' },
          occurredAt: input.now,
          requestId: input.requestId,
          targetId: intake.id,
          targetType: 'member-intake-application',
        })
        return {
          intakeId: intake.id,
          requestId: input.requestId,
          status: 'pendingReview' as const,
          statusReceipt: issueStatusReceipt(input.fingerprintKey, {
            id: intake.id,
            issuedAt: input.now.toISOString(),
            kind: 'intake',
            version: 1,
          }),
          statusReceiptNotice,
          submittedAt: input.now.toISOString(),
        }
      })
    },
  )
}
