import type { ApproveApplication } from '@ascnucc/contracts'
import { ValidationError, type Payload, type PayloadRequest } from 'payload'

import { auditOperations, setAuditOperation } from '@/modules/audit/context'
import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import {
  recruitmentBusinessOperations,
  setRecruitmentBusinessOperation,
} from '@/modules/recruitment/business-context'
import {
  BusinessError,
  isUniqueViolation,
} from '@/modules/shared/business-error'

import { inRequestTransaction } from './transaction'

type ApproveApplicationInput = {
  applicationId: string
  command: ApproveApplication
  now: Date
  requestId: string
}

export async function approveApplication(
  payload: Payload,
  req: PayloadRequest,
  input: ApproveApplicationInput,
) {
  const actor = await loadActor(payload, req)
  if (!actor)
    throw new BusinessError('UNAUTHENTICATED', 'Authentication required', 401)

  const application = await payload.findByID({
    collection: 'membership-applications',
    id: input.applicationId,
    overrideAccess: true,
    req,
  })
  const recruitmentCycleId =
    typeof application.recruitmentCycle === 'string'
      ? application.recruitmentCycle
      : application.recruitmentCycle.id
  const decision = authorize(
    actor,
    'recruitment.application.review',
    { recruitmentCycleId, type: 'recruitmentCycle' },
    input.now,
  )
  if (!decision.allowed) {
    throw new BusinessError('FORBIDDEN', 'Review permission required', 403, {
      reason: decision.reason,
    })
  }
  if (
    application.status !== 'pending' ||
    application.recordVersion !== input.command.expectedVersion
  ) {
    throw new BusinessError('CONFLICT', 'Application has already changed', 409)
  }

  setRecruitmentBusinessOperation(
    req.context,
    recruitmentBusinessOperations.approveApplication,
  )
  setAuditOperation(req.context, auditOperations.approveApplication)

  try {
    return await inRequestTransaction(req, async () => {
      const answers = application.answers as Record<string, unknown>
      const fullName = answers.fullName
      const studentNumber = answers.studentNumber
      if (typeof fullName !== 'string' || typeof studentNumber !== 'string') {
        throw new BusinessError(
          'VALIDATION_FAILED',
          'Required member identity answers are missing',
          400,
        )
      }

      const member = await payload.create({
        collection: 'members',
        data: {
          confirmedAt: input.now.toISOString(),
          name: fullName,
          recordVersion: 1,
          sourceApplication: application.id,
          studentNumber,
        },
        overrideAccess: false,
        req,
      })
      const updated = await payload.update({
        collection: 'membership-applications',
        id: application.id,
        data: {
          recordVersion: application.recordVersion + 1,
          status: 'approved',
        },
        overrideAccess: false,
        req,
      })
      await payload.create({
        collection: 'review-actions',
        data: {
          actedAt: input.now.toISOString(),
          action: 'approve',
          application: application.id,
          comment: input.command.comment,
          reviewer: actor.id,
        },
        overrideAccess: false,
        req,
      })
      await payload.create({
        collection: 'audit-events',
        data: {
          action: 'recruitment.application.approved',
          actor: actor.id,
          metadata: { memberId: member.id },
          occurredAt: input.now.toISOString(),
          requestId: input.requestId,
          result: 'success',
          targetId: application.id,
          targetType: 'membership-application',
        },
        overrideAccess: false,
        req,
      })

      return { application: updated, member }
    })
  } catch (error) {
    const payloadConflict =
      error instanceof ValidationError &&
      error.data.errors.some((fieldError) =>
        ['application', 'sourceApplication', 'studentNumber'].includes(
          fieldError.path,
        ),
      )
    if (isUniqueViolation(error) || payloadConflict) {
      throw new BusinessError(
        'CONFLICT',
        'Application has already been reviewed',
        409,
      )
    }
    throw error
  }
}
