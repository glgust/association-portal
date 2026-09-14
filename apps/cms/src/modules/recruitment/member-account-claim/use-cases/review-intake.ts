import { NotFound, type Payload, type PayloadRequest } from 'payload'

import { assertExpectedVersion } from '@/modules/identity-access/guards'
import { BusinessError } from '@/modules/shared/business-error'

import {
  memberAccountClaimOperations,
  setMemberAccountClaimOperation,
} from '../business-context'
import {
  assertReviewTransition,
  normalizeOptionalStudentNumber,
  type ContactInput,
} from '../domain'
import { requireMemberClaimManager } from '../guards'
import type { MemberClaimAuditPort } from '../ports'
import { publicMessageDefaults } from '../public-messages'
import type { RejectIntakeCommand, ReviewIntakeCommand } from '../schemas'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'
import { isKnownMemberCreationConflict } from './member-creation-conflict'

type IntakeDocument = {
  applicantIdentity: 'cadre' | 'member' | 'staff'
  contacts?: ContactInput[] | null
  id: string
  major?: null | string
  name?: null | string
  recordVersion: number
  status: 'approved' | 'pendingReview' | 'rejected'
  studentNumber?: null | string
}

async function findIntake(
  payload: Payload,
  req: PayloadRequest,
  intakeId: string,
): Promise<IntakeDocument> {
  try {
    return (await payload.findByID({
      collection: 'member-intake-applications',
      id: intakeId,
      overrideAccess: true,
      req,
    })) as unknown as IntakeDocument
  } catch (error) {
    if (error instanceof NotFound) {
      throw new BusinessError('NOT_FOUND', 'Member intake not found', 404)
    }
    throw error
  }
}

export async function approveMemberIntake(
  payload: Payload,
  req: PayloadRequest,
  intakeId: string,
  input: {
    audit: MemberClaimAuditPort
    command: ReviewIntakeCommand
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  const intakeForLock = await findIntake(payload, req, intakeId)
  const studentNumberForLock =
    input.command.member.mode === 'create'
      ? normalizeOptionalStudentNumber(intakeForLock.studentNumber)
      : null
  try {
    return await withMemberClaimLocks(
      payload,
      {
        intakeIds: [intakeId],
        memberIds:
          input.command.member.mode === 'existing'
            ? [input.command.member.memberId]
            : [],
        memberStudentNumbers: studentNumberForLock
          ? [studentNumberForLock]
          : [],
      },
      () => {
        setMemberAccountClaimOperation(
          req.context,
          memberAccountClaimOperations.approveIntake,
        )
        return inMemberAccountClaimTransaction(req, async () => {
          const intake = await findIntake(payload, req, intakeId)
          assertReviewTransition(intake.status, 'approved')
          assertExpectedVersion(
            intake.recordVersion,
            input.command.expectedVersion,
          )
          if (!intake.name || !intake.contacts?.length) {
            throw new BusinessError(
              'CONFLICT',
              'Intake profile is unavailable',
              409,
            )
          }

          let memberId: string
          if (input.command.member.mode === 'create') {
            if (intake.studentNumber) {
              const existing = await payload.find({
                collection: 'members',
                limit: 1,
                overrideAccess: true,
                pagination: false,
                req,
                where: { studentNumber: { equals: intake.studentNumber } },
              })
              if (existing.docs.length > 0) {
                throw new BusinessError(
                  'CONFLICT',
                  'Member identity already exists',
                  409,
                )
              }
            }
            const member = await payload.create({
              collection: 'members',
              data: {
                confirmedAt: input.now.toISOString(),
                contacts: intake.contacts,
                major: intake.major ?? null,
                membershipIdentity: intake.applicantIdentity,
                name: intake.name,
                recordVersion: 1,
                source: 'manualVerification',
                studentNumber: intake.studentNumber ?? null,
              },
              overrideAccess: false,
              req,
            })
            memberId = member.id
          } else {
            const member = await payload.findByID({
              collection: 'members',
              id: input.command.member.memberId,
              overrideAccess: true,
              req,
            })
            memberId = member.id
            if (input.command.adoptApplicationProfile) {
              await payload.update({
                collection: 'members',
                id: member.id,
                data: {
                  contacts: intake.contacts,
                  major: intake.major || member.major || null,
                  recordVersion: (member.recordVersion ?? 1) + 1,
                },
                overrideAccess: false,
                req,
              })
            }
          }

          const updated = await payload.update({
            collection: 'member-intake-applications',
            id: intake.id,
            data: {
              contacts: [],
              major: null,
              member: memberId,
              name: null,
              privacyPurposeConfirmed: false,
              publicMessage:
                input.command.publicMessage ??
                publicMessageDefaults.intakeApproved,
              publicMessageUpdatedAt: input.now.toISOString(),
              publicMessageUpdatedBy: actor.id,
              recordVersion: intake.recordVersion + 1,
              reviewedAt: input.now.toISOString(),
              reviewedBy: actor.id,
              status: 'approved',
              studentNumber: null,
            },
            overrideAccess: false,
            req,
          })
          await input.audit.append(req, {
            action: 'membership.intake.approved',
            actorId: actor.id,
            metadata: {
              memberMode: input.command.member.mode,
              status: 'approved',
            },
            occurredAt: input.now,
            requestId: input.requestId,
            targetId: intake.id,
            targetType: 'member-intake-application',
          })
          return {
            intakeId: updated.id,
            memberId,
            recordVersion: updated.recordVersion,
            requestId: input.requestId,
            status: 'approved' as const,
          }
        })
      },
    )
  } catch (error) {
    if (isKnownMemberCreationConflict(error, { includeAccount: false })) {
      throw new BusinessError('CONFLICT', 'Member identity already exists', 409)
    }
    throw error
  }
}

export async function rejectMemberIntake(
  payload: Payload,
  req: PayloadRequest,
  intakeId: string,
  input: {
    audit: MemberClaimAuditPort
    command: RejectIntakeCommand
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  return withMemberClaimLocks(payload, { intakeIds: [intakeId] }, () => {
    setMemberAccountClaimOperation(
      req.context,
      memberAccountClaimOperations.rejectIntake,
    )
    return inMemberAccountClaimTransaction(req, async () => {
      const intake = await findIntake(payload, req, intakeId)
      assertReviewTransition(intake.status, 'rejected')
      assertExpectedVersion(intake.recordVersion, input.command.expectedVersion)
      const updated = await payload.update({
        collection: 'member-intake-applications',
        id: intake.id,
        data: {
          contacts: [],
          major: null,
          name: null,
          privacyPurposeConfirmed: false,
          publicMessage:
            input.command.publicMessage ?? publicMessageDefaults.intakeRejected,
          publicMessageUpdatedAt: input.now.toISOString(),
          publicMessageUpdatedBy: actor.id,
          recordVersion: intake.recordVersion + 1,
          rejectionReason: input.command.reason,
          reviewedAt: input.now.toISOString(),
          reviewedBy: actor.id,
          status: 'rejected',
          studentNumber: null,
        },
        overrideAccess: false,
        req,
      })
      await input.audit.append(req, {
        action: 'membership.intake.rejected',
        actorId: actor.id,
        metadata: { reason: input.command.reason, status: 'rejected' },
        occurredAt: input.now,
        requestId: input.requestId,
        targetId: intake.id,
        targetType: 'member-intake-application',
      })
      return {
        intakeId: updated.id,
        recordVersion: updated.recordVersion,
        requestId: input.requestId,
        status: 'rejected' as const,
      }
    })
  })
}
