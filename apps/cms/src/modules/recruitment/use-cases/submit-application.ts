import type { ApplicationSubmit } from '@ascnucc/contracts'
import { isDeepStrictEqual } from 'node:util'
import type { Payload, PayloadRequest } from 'payload'

import { auditOperations, setAuditOperation } from '@/modules/audit/context'
import {
  recruitmentBusinessOperations,
  setRecruitmentBusinessOperation,
} from '@/modules/recruitment/business-context'
import { validateAnswers } from '@/modules/recruitment/form-schema/answers'
import { BusinessError } from '@/modules/shared/business-error'

import { inRequestTransaction } from './transaction'

type SubmitApplicationInput = {
  command: ApplicationSubmit
  idempotencyKey: string
  now: Date
  recruitmentCycleId: string
  requestId: string
}

export async function submitApplication(
  payload: Payload,
  req: PayloadRequest,
  input: SubmitApplicationInput,
) {
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 100) {
    throw new BusinessError('VALIDATION_FAILED', 'Invalid Idempotency-Key', 400)
  }

  setRecruitmentBusinessOperation(
    req.context,
    recruitmentBusinessOperations.submitApplication,
  )
  setAuditOperation(req.context, auditOperations.submitApplication)

  return inRequestTransaction(req, async () => {
    const existing = await payload.find({
      collection: 'membership-applications',
      limit: 1,
      overrideAccess: false,
      req,
      where: {
        idempotencyKey: {
          equals: input.idempotencyKey,
        },
      },
    })
    if (existing.totalDocs > 0) {
      const application = existing.docs[0]
      const cycleId =
        typeof application.recruitmentCycle === 'string'
          ? application.recruitmentCycle
          : application.recruitmentCycle.id
      const versionId =
        typeof application.formVersion === 'string'
          ? application.formVersion
          : application.formVersion.id
      const conflict = () =>
        new BusinessError(
          'CONFLICT',
          'Idempotency-Key has already been used for another submission',
          409,
        )
      if (
        cycleId !== input.recruitmentCycleId ||
        versionId !== input.command.formVersionId
      ) {
        throw conflict()
      }
      const version = await payload.findByID({
        collection: 'form-versions',
        id: versionId,
        overrideAccess: false,
        req,
      })
      const validated = validateAnswers(version.schema, input.command.answers)
      if (
        !validated.success ||
        !isDeepStrictEqual(validated.answers, application.answers)
      ) {
        throw conflict()
      }
      return application
    }

    const cycle = await payload.findByID({
      collection: 'recruitment-cycles',
      id: input.recruitmentCycleId,
      overrideAccess: true,
      req,
    })
    if (
      cycle.status !== 'open' ||
      (cycle.opensAt && new Date(cycle.opensAt) > input.now) ||
      (cycle.closesAt && new Date(cycle.closesAt) <= input.now)
    ) {
      throw new BusinessError('CONFLICT', 'Recruitment cycle is not open', 409)
    }

    const formVersion = await payload.findByID({
      collection: 'form-versions',
      id: input.command.formVersionId,
      overrideAccess: false,
      req,
    })
    const versionCycleId =
      typeof formVersion.recruitmentCycle === 'string'
        ? formVersion.recruitmentCycle
        : formVersion.recruitmentCycle.id
    if (formVersion.status !== 'published' || versionCycleId !== cycle.id) {
      throw new BusinessError(
        'VALIDATION_FAILED',
        'Form version does not belong to this cycle',
        400,
      )
    }

    const validated = validateAnswers(formVersion.schema, input.command.answers)
    if (!validated.success) {
      throw new BusinessError(
        'VALIDATION_FAILED',
        'Application answers are invalid',
        400,
        {
          issues: validated.issues,
        },
      )
    }

    const application = await payload.create({
      collection: 'membership-applications',
      data: {
        answers: validated.answers,
        formVersion: formVersion.id,
        idempotencyKey: input.idempotencyKey,
        recordVersion: 1,
        recruitmentCycle: cycle.id,
        status: 'pending',
        submittedAt: input.now.toISOString(),
      },
      overrideAccess: false,
      req,
    })

    await payload.create({
      collection: 'audit-events',
      data: {
        action: 'recruitment.application.submitted',
        occurredAt: input.now.toISOString(),
        requestId: input.requestId,
        result: 'success',
        targetId: application.id,
        targetType: 'membership-application',
      },
      overrideAccess: false,
      req,
    })

    return application
  })
}
