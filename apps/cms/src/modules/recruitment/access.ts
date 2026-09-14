import type { Access, PayloadRequest } from 'payload'

import { authorize, type Actor } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'

import { recruitmentBusinessOperations } from './business-context'

async function activeActor(req: PayloadRequest): Promise<Actor | null> {
  return loadActor(req.payload, req)
}

async function readableRecruitmentCycleIds(
  req: PayloadRequest,
  actor: Actor,
): Promise<string[]> {
  const cycles = await req.payload.find({
    collection: 'recruitment-cycles',
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
  })
  const now = new Date()
  return cycles.docs
    .filter(
      (cycle) =>
        authorize(
          actor,
          'recruitment.application.read',
          { recruitmentCycleId: cycle.id, type: 'recruitmentCycle' },
          now,
        ).allowed,
    )
    .map((cycle) => cycle.id)
}

export const canReadMember: Access = async ({ req }) => {
  const actor = await activeActor(req)
  return actor
    ? authorize(actor, 'accounts.manage', { type: 'global' }, new Date())
        .allowed
    : false
}

export const canReadMembershipApplication: Access = async ({ req }) => {
  if (
    req.context.recruitmentBusinessOperation ===
    recruitmentBusinessOperations.submitApplication
  ) {
    return true
  }
  const actor = await activeActor(req)
  if (!actor) return false
  const cycleIds = await readableRecruitmentCycleIds(req, actor)
  return cycleIds.length ? { recruitmentCycle: { in: cycleIds } } : false
}

export const canReadReviewAction: Access = async ({ req }) => {
  const actor = await activeActor(req)
  if (!actor) return false
  const cycleIds = await readableRecruitmentCycleIds(req, actor)
  if (!cycleIds.length) return false
  const applications = await req.payload.find({
    collection: 'membership-applications',
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    where: { recruitmentCycle: { in: cycleIds } },
  })
  const applicationIds = applications.docs.map((application) => application.id)
  return applicationIds.length ? { application: { in: applicationIds } } : false
}
