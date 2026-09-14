import type { Payload, PayloadRequest } from 'payload'

import { BusinessError } from '@/modules/shared/business-error'

import {
  memberAccountClaimOperations,
  setMemberAccountClaimOperation,
} from '../business-context'
import { keyedRequestFingerprint } from '../fingerprint'
import type { MemberClaimIdentityPort } from '../identity-port'
import type { MemberClaimAuditPort } from '../ports'
import type { SubmitClaimCommand } from '../schemas'
import { issueStatusReceipt } from '../status-receipt'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'
import { normalizedProfile, relationId } from './helpers'

type ClaimMember = {
  authUser?: null | string | { id: string }
  id: string
  membershipIdentity?: null | string
  name: string
  studentNumber?: null | string
}

export type SubmitClaimResult =
  | { outcome: 'manualVerificationRequired'; requestId: string }
  | {
      claimId: string
      outcome: 'pendingReview'
      requestId: string
      statusReceipt: string
      statusReceiptNotice: string
      submittedAt: string
    }

const statusReceiptNotice =
  '请立即保存此查询凭证；它只显示在本次成功结果中，不可用于登录或修改申请。'

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

export async function submitAccountClaim(
  payload: Payload,
  req: PayloadRequest,
  input: {
    audit: MemberClaimAuditPort
    command: SubmitClaimCommand
    fingerprintKey: string | Uint8Array
    idempotencyKey: string
    identity: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
): Promise<SubmitClaimResult> {
  const profile = normalizedProfile(input.command)
  if (!profile.studentNumber) {
    return { outcome: 'manualVerificationRequired', requestId: input.requestId }
  }
  const fingerprint = keyedRequestFingerprint(input.fingerprintKey, 'claim', {
    contacts: profile.contacts,
    major: profile.major,
    membershipIdentity: input.command.membershipIdentity,
    name: profile.name,
    studentNumber: profile.studentNumber,
  })

  return withMemberClaimLocks(
    payload,
    { idempotencyKeys: [`claim:${input.idempotencyKey}`] },
    async () => {
      const replay = await payload.find({
        collection: 'account-claims',
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
          claimId: replay.docs[0].id,
          outcome: 'pendingReview',
          requestId: replay.docs[0].requestId,
          statusReceipt: issueStatusReceipt(input.fingerprintKey, {
            id: replay.docs[0].id,
            issuedAt: requireStatusReceiptIssuedAt(
              replay.docs[0].statusAccessIssuedAt,
            ),
            kind: 'claim',
            version: replay.docs[0].statusAccessVersion,
          }),
          statusReceiptNotice,
          submittedAt: replay.docs[0].submittedAt,
        }
      }

      const matches = await payload.find({
        collection: 'members',
        limit: 2,
        overrideAccess: true,
        req,
        where: {
          and: [
            { name: { equals: profile.name } },
            { studentNumber: { equals: profile.studentNumber } },
            {
              membershipIdentity: {
                equals: input.command.membershipIdentity,
              },
            },
          ],
        },
      })
      if (matches.totalDocs !== 1) {
        return {
          outcome: 'manualVerificationRequired',
          requestId: input.requestId,
        }
      }
      const member = matches.docs[0] as unknown as ClaimMember
      const accountId = relationId(member.authUser)
      if (!accountId) {
        return {
          outcome: 'manualVerificationRequired',
          requestId: input.requestId,
        }
      }
      return withMemberClaimLocks(
        payload,
        { accountIds: [accountId], memberIds: [member.id] },
        () => {
          setMemberAccountClaimOperation(
            req.context,
            memberAccountClaimOperations.submitClaim,
          )
          return inMemberAccountClaimTransaction(req, async () => {
            const lockedReplay = await payload.find({
              collection: 'account-claims',
              limit: 1,
              overrideAccess: true,
              req,
              where: { idempotencyKey: { equals: input.idempotencyKey } },
            })
            if (lockedReplay.docs[0]) {
              if (lockedReplay.docs[0].requestFingerprint !== fingerprint) {
                throw new BusinessError(
                  'CONFLICT',
                  'Idempotency key was already used',
                  409,
                )
              }
              return {
                claimId: lockedReplay.docs[0].id,
                outcome: 'pendingReview' as const,
                requestId: lockedReplay.docs[0].requestId,
                statusReceipt: issueStatusReceipt(input.fingerprintKey, {
                  id: lockedReplay.docs[0].id,
                  issuedAt: requireStatusReceiptIssuedAt(
                    lockedReplay.docs[0].statusAccessIssuedAt,
                  ),
                  kind: 'claim',
                  version: lockedReplay.docs[0].statusAccessVersion,
                }),
                statusReceiptNotice,
                submittedAt: lockedReplay.docs[0].submittedAt,
              }
            }
            const lockedMember = (await payload.findByID({
              collection: 'members',
              id: member.id,
              overrideAccess: true,
              req,
            })) as unknown as ClaimMember
            if (relationId(lockedMember.authUser) !== accountId) {
              return {
                outcome: 'manualVerificationRequired' as const,
                requestId: input.requestId,
              }
            }
            const account = await input.identity.getClaimAccount(req, accountId)
            if (!account || account.status !== 'pendingClaim') {
              return {
                outcome: 'manualVerificationRequired' as const,
                requestId: input.requestId,
              }
            }
            const updatedAccount = await input.identity.submitClaimPassword(
              req,
              {
                accountId,
                expectedVersion: account.recordVersion,
                password: input.command.password,
              },
            )
            const claim = await payload.create({
              collection: 'account-claims',
              data: {
                applicantIdentity: input.command.membershipIdentity,
                authorizationSummary: account.authorizationSummary,
                authUser: accountId,
                contacts: profile.contacts,
                idempotencyKey: input.idempotencyKey,
                major: profile.major,
                member: member.id,
                recordVersion: 1,
                requestFingerprint: fingerprint,
                requestId: input.requestId,
                status: 'pendingReview',
                statusAccessIssuedAt: input.now.toISOString(),
                statusAccessVersion: 1,
                submittedAt: input.now.toISOString(),
                submittedAuthUserVersion: updatedAccount.recordVersion,
              },
              overrideAccess: false,
              req,
            })
            await input.audit.append(req, {
              action: 'membership.account-claim.submitted',
              metadata: { status: 'pendingReview' },
              occurredAt: input.now,
              requestId: input.requestId,
              targetId: claim.id,
              targetType: 'account-claim',
            })
            return {
              claimId: claim.id,
              outcome: 'pendingReview' as const,
              requestId: input.requestId,
              statusReceipt: issueStatusReceipt(input.fingerprintKey, {
                id: claim.id,
                issuedAt: input.now.toISOString(),
                kind: 'claim',
                version: 1,
              }),
              statusReceiptNotice,
              submittedAt: input.now.toISOString(),
            }
          })
        },
      )
    },
  )
}
