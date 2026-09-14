import { formSchema } from '@ascnucc/contracts'
import type { Payload, PayloadRequest } from 'payload'

import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import {
  recruitmentBusinessOperations,
  setRecruitmentBusinessOperation,
} from '@/modules/recruitment/business-context'
import { hashFormSchema } from '@/modules/recruitment/form-schema/schema-hash'
import { BusinessError } from '@/modules/shared/business-error'

export async function publishFormDefinition(
  payload: Payload,
  req: PayloadRequest,
  formDefinitionId: string,
  now: Date,
) {
  const actor = await loadActor(payload, req)
  if (!actor)
    throw new BusinessError('UNAUTHENTICATED', 'Authentication required', 401)

  const definition = await payload.findByID({
    collection: 'form-definitions',
    id: formDefinitionId,
    overrideAccess: true,
  })
  const schema = formSchema.parse(definition.draftSchema)
  const versions = await payload.find({
    collection: 'form-versions',
    limit: 1,
    overrideAccess: true,
    sort: '-version',
    where: {
      formDefinition: {
        equals: definition.id,
      },
    },
  })
  const version = versions.docs.length === 0 ? 1 : versions.docs[0].version + 1
  const recruitmentCycle =
    typeof definition.recruitmentCycle === 'string'
      ? definition.recruitmentCycle
      : definition.recruitmentCycle.id

  const decision = authorize(
    actor,
    'recruitment.form.manage',
    { recruitmentCycleId: recruitmentCycle, type: 'recruitmentCycle' },
    now,
  )
  if (!decision.allowed) {
    throw new BusinessError(
      'FORBIDDEN',
      'Form management permission required',
      403,
      {
        reason: decision.reason,
      },
    )
  }

  setRecruitmentBusinessOperation(
    req.context,
    recruitmentBusinessOperations.publishForm,
  )

  return payload.create({
    collection: 'form-versions',
    data: {
      formDefinition: definition.id,
      publishedAt: now.toISOString(),
      recruitmentCycle,
      schema,
      schemaHash: hashFormSchema(schema),
      status: 'published',
      version,
    },
    overrideAccess: false,
    req,
  })
}
