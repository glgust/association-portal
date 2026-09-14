import 'dotenv/config'

import { randomUUID } from 'node:crypto'
import { createLocalReq, getPayload, type TypedUser } from 'payload'

import config from '../src/payload.config'
import { approveApplication } from '../src/modules/recruitment/use-cases/approve-application'
import { submitApplication } from '../src/modules/recruitment/use-cases/submit-application'
import { BusinessError } from '../src/modules/shared/business-error'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Business-loop integration test may only use local ascnucc_demo_test',
  )
}

const payload = await getPayload({ config })
const runId = randomUUID()
const now = new Date('2026-07-13T12:00:00.000Z')

async function ensureUser(username: string, role: 'admin' | 'cadre' | 'staff') {
  const found = await payload.find({
    collection: 'auth-users',
    limit: 1,
    overrideAccess: true,
    where: { username: { equals: username } },
  })
  if (found.totalDocs > 0) return found.docs[0]

  return payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'external',
      displayName: `${role} integration user`,
      password: `Local-${role}-Only-2026!`,
      recordVersion: 1,
      role,
      status: 'active',
      username,
    },
    overrideAccess: true,
  })
}

function typedUser(user: Awaited<ReturnType<typeof ensureUser>>): TypedUser {
  return { ...user, collection: 'auth-users' } as TypedUser
}

const [staff, cadre, admin] = await Promise.all([
  ensureUser('integration-staff', 'staff'),
  ensureUser('integration-cadre', 'cadre'),
  ensureUser('integration-admin', 'admin'),
])
const cycle = (
  await payload.find({
    collection: 'recruitment-cycles',
    limit: 1,
    overrideAccess: true,
    where: { code: { equals: 'demo-2026-m001' } },
  })
).docs[0]
if (!cycle)
  throw new Error('Run seed:migration-fixture before the business-loop test')

const formVersion = (
  await payload.find({
    collection: 'form-versions',
    limit: 1,
    overrideAccess: true,
    sort: '-version',
    where: { recruitmentCycle: { equals: cycle.id } },
  })
).docs[0]
if (!formVersion)
  throw new Error('Published integration FormVersion is missing')

async function submit(suffix: string) {
  const req = await createLocalReq({}, payload)
  return submitApplication(payload, req, {
    command: {
      answers: {
        fullName: `测试同学-${suffix}`,
        studentNumber: `TEST-${runId}-${suffix}`,
      },
      formVersionId: formVersion.id,
    },
    idempotencyKey: `${runId}-${suffix}`,
    now,
    recruitmentCycleId: cycle.id,
    requestId: `submit-${runId}-${suffix}`,
  })
}

async function expectForbidden(
  user: Awaited<ReturnType<typeof ensureUser>>,
  applicationId: string,
) {
  const req = await createLocalReq({ user: typedUser(user) }, payload)
  try {
    await approveApplication(payload, req, {
      applicationId,
      command: { expectedVersion: 1 },
      now,
      requestId: `forbidden-${runId}`,
    })
  } catch (error) {
    if (error instanceof BusinessError && error.code === 'FORBIDDEN') return
    throw error
  }
  throw new Error(`${user.role} unexpectedly approved an application`)
}

const first = await submit('first')
const firstReplay = await submitApplication(
  payload,
  await createLocalReq({}, payload),
  {
    command: {
      answers: first.answers as Record<string, string>,
      formVersionId: formVersion.id,
    },
    idempotencyKey: `${runId}-first`,
    now,
    recruitmentCycleId: cycle.id,
    requestId: `replay-${runId}`,
  },
)
if (firstReplay.id !== first.id)
  throw new Error('Idempotent replay created a second application')

await expectForbidden(staff, first.id)
await expectForbidden(admin, first.id)
const beforeApproval = await payload.findByID({
  collection: 'membership-applications',
  id: first.id,
  overrideAccess: true,
})
if (beforeApproval.status !== 'pending')
  throw new Error('Forbidden review changed application state')

const approved = await approveApplication(
  payload,
  await createLocalReq({ user: typedUser(cadre) }, payload),
  {
    applicationId: first.id,
    command: { expectedVersion: 1 },
    now,
    requestId: `approve-${runId}`,
  },
)
if (
  approved.application.status !== 'approved' ||
  approved.application.recordVersion !== 2
) {
  throw new Error(
    'Cadre approval did not produce the expected application state',
  )
}

const concurrent = await submit('concurrent')
const concurrentResults = await Promise.allSettled(
  [1, 2].map(async (attempt) =>
    approveApplication(
      payload,
      await createLocalReq({ user: typedUser(cadre) }, payload),
      {
        applicationId: concurrent.id,
        command: { expectedVersion: 1 },
        now,
        requestId: `concurrent-${runId}-${attempt}`,
      },
    ),
  ),
)
const successes = concurrentResults.filter(
  (result) => result.status === 'fulfilled',
)
const conflicts = concurrentResults.filter(
  (result) =>
    result.status === 'rejected' && result.reason instanceof BusinessError,
)
if (successes.length !== 1 || conflicts.length !== 1) {
  const diagnostics = concurrentResults.map((result) =>
    result.status === 'fulfilled'
      ? { applicationId: result.value.application.id, status: 'fulfilled' }
      : {
          code:
            result.reason &&
            typeof result.reason === 'object' &&
            'code' in result.reason
              ? result.reason.code
              : undefined,
          message:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          name:
            result.reason instanceof Error
              ? result.reason.name
              : typeof result.reason,
          status: 'rejected',
        },
  )
  throw new Error(
    `Concurrent review did not result in exactly one success and one conflict: ${JSON.stringify(diagnostics)}`,
  )
}

for (const applicationId of [first.id, concurrent.id]) {
  const [members, reviews, audits] = await Promise.all([
    payload.count({
      collection: 'members',
      overrideAccess: true,
      where: { sourceApplication: { equals: applicationId } },
    }),
    payload.count({
      collection: 'review-actions',
      overrideAccess: true,
      where: { application: { equals: applicationId } },
    }),
    payload.count({
      collection: 'audit-events',
      overrideAccess: true,
      where: {
        and: [
          { targetId: { equals: applicationId } },
          { action: { equals: 'recruitment.application.approved' } },
        ],
      },
    }),
  ])
  if (
    members.totalDocs !== 1 ||
    reviews.totalDocs !== 1 ||
    audits.totalDocs !== 1
  ) {
    throw new Error(
      `Atomic approval artifacts are incomplete for ${applicationId}`,
    )
  }
}

const rollbackProbe = await submit('rollback')
await payload.create({
  collection: 'review-actions',
  data: {
    actedAt: now.toISOString(),
    action: 'approve',
    application: rollbackProbe.id,
    comment: 'Pre-existing conflict used to verify transaction rollback',
    reviewer: cadre.id,
  },
  overrideAccess: true,
})
try {
  await approveApplication(
    payload,
    await createLocalReq({ user: typedUser(cadre) }, payload),
    {
      applicationId: rollbackProbe.id,
      command: { expectedVersion: 1 },
      now,
      requestId: `rollback-${runId}`,
    },
  )
  throw new Error('Fault-injected review unexpectedly succeeded')
} catch (error) {
  if (!(error instanceof BusinessError) || error.code !== 'CONFLICT')
    throw error
}
const [rolledBackApplication, rolledBackMembers, rolledBackApprovalAudits] =
  await Promise.all([
    payload.findByID({
      collection: 'membership-applications',
      id: rollbackProbe.id,
      overrideAccess: true,
    }),
    payload.count({
      collection: 'members',
      overrideAccess: true,
      where: { sourceApplication: { equals: rollbackProbe.id } },
    }),
    payload.count({
      collection: 'audit-events',
      overrideAccess: true,
      where: {
        and: [
          { targetId: { equals: rollbackProbe.id } },
          { action: { equals: 'recruitment.application.approved' } },
        ],
      },
    }),
  ])
if (
  rolledBackApplication.status !== 'pending' ||
  rolledBackApplication.recordVersion !== 1 ||
  rolledBackMembers.totalDocs !== 0 ||
  rolledBackApprovalAudits.totalDocs !== 0
) {
  throw new Error('Fault-injected review left a partial approval transaction')
}

payload.logger.info(
  `Business loop passed: idempotency, forbidden review, atomic rollback and concurrency (${runId})`,
)
process.exit(0)
