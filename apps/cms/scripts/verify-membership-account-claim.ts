import 'dotenv/config'

import { randomUUID } from 'node:crypto'
import {
  createLocalReq,
  getPayload,
  type PayloadRequest,
  type TypedUser,
} from 'payload'

import config from '../src/payload.config'
import type { AuthUser } from '../src/payload-types'
import {
  reissuePendingActivationCredential,
  updateAccount,
} from '../src/modules/identity-access/use-cases/accounts'
import { setPermissionOverride } from '../src/modules/identity-access/use-cases/permission-overrides'
import {
  createMemberClaimAuditPort,
  createMemberClaimIdentityPort,
} from '../src/modules/recruitment/member-account-claim/adapters'
import { preconfigureMemberAccountClaim } from '../src/modules/recruitment/member-account-claim/use-cases/preconfigure'
import {
  approveAccountClaim,
  rejectAccountClaim,
} from '../src/modules/recruitment/member-account-claim/use-cases/review-claim'
import { approveMemberIntake } from '../src/modules/recruitment/member-account-claim/use-cases/review-intake'
import { submitAccountClaim } from '../src/modules/recruitment/member-account-claim/use-cases/submit-claim'
import { submitMemberIntake } from '../src/modules/recruitment/member-account-claim/use-cases/submit-intake'
import { convertMemberClaimToDirect } from '../src/modules/recruitment/member-account-claim/use-cases/convert-to-direct'
import { queryMembershipStatus } from '../src/modules/recruitment/member-account-claim/use-cases/query-status'
import {
  reissueMembershipStatusReceipt,
  updateMembershipPublicMessage,
} from '../src/modules/recruitment/member-account-claim/use-cases/status-admin'
import { withdrawMemberClaimConversion } from '../src/modules/recruitment/member-account-claim/use-cases/withdraw-conversion'
import { BusinessError } from '../src/modules/shared/business-error'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Membership account claim verification may only use local ascnucc_demo_test',
  )
}

const payload = await getPayload({ config })
const identity = createMemberClaimIdentityPort(payload)
const audit = createMemberClaimAuditPort(payload)
const runId = randomUUID()
const entropy = runId.replaceAll('-', '').slice(0, 16)
let sequence = 0

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function nextFixture(label: string) {
  sequence += 1
  const suffix = `${sequence}${entropy}`.slice(0, 16)
  return {
    contact: `fictional-${label}-${suffix}`,
    name: `虚构会员${label}${sequence}`,
    password: `Fictional ${label} password ${suffix}!`,
    studentNumber: `26${String(sequence).padStart(2, '0')}${entropy
      .replaceAll(/[^0-9]/g, '7')
      .padEnd(8, '7')
      .slice(0, 8)}`,
  }
}

async function createOwner(): Promise<AuthUser> {
  return payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'external',
      defaultRoleExpiresAt: null,
      displayName: `虚构会员专项 Owner ${entropy}`,
      password: `Fictional owner password ${entropy}!`,
      recordVersion: 1,
      role: 'owner',
      status: 'active',
      studentNumber: null,
      temporaryCredentialExpiresAt: null,
      username: `membership-owner-${entropy}`.slice(0, 32),
    },
    overrideAccess: true,
    showHiddenFields: true,
  })
}

async function createAdmin(): Promise<AuthUser> {
  return payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'external',
      defaultRoleExpiresAt: null,
      displayName: `虚构会员专项 Admin ${entropy}`,
      password: `Fictional admin password ${entropy}!`,
      recordVersion: 1,
      role: 'admin',
      status: 'active',
      studentNumber: null,
      temporaryCredentialExpiresAt: null,
      username: `membership-admin-${entropy}`.slice(0, 32),
    },
    overrideAccess: true,
    showHiddenFields: true,
  })
}

async function requestFor(
  user: AuthUser | null,
  requestId: string,
): Promise<PayloadRequest> {
  return createLocalReq(
    {
      req: { headers: new Headers({ 'x-request-id': requestId }) },
      ...(user
        ? { user: { ...user, collection: 'auth-users' } as TypedUser }
        : {}),
    },
    payload,
  )
}

function expectOneConflict(
  results: PromiseSettledResult<unknown>[],
  label: string,
): void {
  assert(results.length === 2, `${label} did not produce two results`)
  const fulfilled = results.filter((result) => result.status === 'fulfilled')
  const rejected = results.filter((result) => result.status === 'rejected')
  assert(fulfilled.length === 1, `${label} did not have exactly one winner`)
  assert(rejected.length === 1, `${label} did not reject exactly one loser`)
  const reason = rejected[0]?.reason
  assert(
    reason instanceof BusinessError &&
      reason.code === 'CONFLICT' &&
      reason.status === 409,
    `${label} loser was not a stable 409 conflict (${reason instanceof Error ? `${reason.name}:${reason.message}` : typeof reason})`,
  )
}

async function readAccount(id: string) {
  return payload.findByID({
    collection: 'auth-users',
    id,
    overrideAccess: true,
    showHiddenFields: true,
  })
}

async function readClaim(id: string) {
  return payload.findByID({
    collection: 'account-claims',
    id,
    overrideAccess: true,
  })
}

async function readMember(id: string) {
  return payload.findByID({
    collection: 'members',
    id,
    overrideAccess: true,
  })
}

async function auditCount(requestId: string): Promise<number> {
  return (
    await payload.count({
      collection: 'audit-events',
      overrideAccess: true,
      where: { requestId: { equals: requestId } },
    })
  ).totalDocs
}

async function prepareClaim(owner: AuthUser, label: string) {
  const fixture = nextFixture(label)
  const preconfigured = await preconfigureMemberAccountClaim(
    payload,
    await requestFor(owner, `membership-${label}-preconfigure-${runId}`),
    {
      actorId: owner.id,
      audit,
      command: {
        member: {
          mode: 'create',
          offlineInterviewConfirmed: true,
          profile: {
            contacts: [
              {
                isPrimary: true,
                label: null,
                type: 'wechat',
                value: fixture.contact,
              },
            ],
            major: null,
            membershipIdentity: 'member',
            name: fixture.name,
            source: 'offlineInterview',
            studentNumber: fixture.studentNumber,
          },
        },
        overrides: [],
        role: 'member',
      },
      identity,
      now: new Date(),
      requestId: `membership-${label}-preconfigure-${runId}`,
    },
  )
  const submitted = await submitAccountClaim(
    payload,
    await requestFor(null, `membership-${label}-submit-${runId}`),
    {
      audit,
      command: {
        contacts: [
          {
            isPrimary: true,
            label: null,
            type: 'wechat',
            value: fixture.contact,
          },
        ],
        name: fixture.name,
        major: null,
        membershipIdentity: 'member',
        password: fixture.password,
        passwordConfirmation: fixture.password,
        studentNumber: fixture.studentNumber,
      },
      fingerprintKey: `membership-fingerprint-${runId}`,
      idempotencyKey: randomUUID(),
      identity,
      now: new Date(),
      requestId: `membership-${label}-submit-${runId}`,
    },
  )
  assert(submitted.outcome === 'pendingReview', `${label} was not submitted`)
  return {
    ...fixture,
    accountId: preconfigured.accountId,
    claimId: submitted.claimId,
    memberId: preconfigured.memberId,
    statusReceipt: submitted.statusReceipt,
  }
}

async function prepareCadreWithIncompatibleOverrides(
  owner: AuthUser,
  label: string,
) {
  const fixture = nextFixture(label)
  const account = await payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'external',
      defaultRoleExpiresAt: null,
      displayName: fixture.name,
      password: fixture.password,
      recordVersion: 1,
      role: 'cadre',
      status: 'active',
      studentNumber: null,
      temporaryCredentialExpiresAt: null,
      username: `cadre-${label}-${entropy}`.slice(0, 32),
    },
    overrideAccess: true,
    showHiddenFields: true,
  })
  const accountManagement = await setPermissionOverride(
    payload,
    await requestFor(owner, `membership-${label}-accounts-override-${runId}`),
    account.id,
    {
      effect: 'allow',
      expectedVersion: account.recordVersion,
      expiresAt: null,
      permission: 'accounts.manage',
      reason: '虚构角色降级权限收口验证',
      recruitmentCycleId: null,
      scopeType: 'global',
    },
    {
      now: new Date(),
      requestId: `membership-${label}-accounts-override-${runId}`,
    },
  )
  const globalRecruitmentRead = await setPermissionOverride(
    payload,
    await requestFor(
      owner,
      `membership-${label}-recruitment-override-${runId}`,
    ),
    account.id,
    {
      effect: 'allow',
      expectedVersion: accountManagement.accountVersion,
      expiresAt: null,
      permission: 'recruitment.application.read',
      reason: '虚构角色降级 Scope 收口验证',
      recruitmentCycleId: null,
      scopeType: 'global',
    },
    {
      now: new Date(),
      requestId: `membership-${label}-recruitment-override-${runId}`,
    },
  )
  return {
    accountId: account.id,
    accountVersion: globalRecruitmentRead.accountVersion,
    overrideIds: [
      accountManagement.overrideId,
      globalRecruitmentRead.overrideId,
    ],
  }
}

async function readOverride(id: string) {
  return payload.findByID({
    collection: 'permission-overrides',
    id,
    overrideAccess: true,
  })
}

const owner = await createOwner()
const admin = await createAdmin()

// A role downgrade must close overrides that the target role may never use.
const downgrade = await prepareCadreWithIncompatibleOverrides(
  owner,
  'downgrade',
)
const downgradeAt = new Date()
await updateAccount(
  payload,
  await requestFor(owner, `membership-downgrade-${runId}`),
  downgrade.accountId,
  {
    expectedVersion: downgrade.accountVersion,
    reason: '虚构 cadre 降级 member 收口验证',
    role: 'member',
  },
  { now: downgradeAt, requestId: `membership-downgrade-${runId}` },
)
const downgradedAccount = await readAccount(downgrade.accountId)
assert(downgradedAccount.role === 'member', 'Role downgrade did not commit')
for (const overrideId of downgrade.overrideIds) {
  const override = await readOverride(overrideId)
  const revokedBy =
    typeof override.revokedBy === 'string'
      ? override.revokedBy
      : override.revokedBy?.id
  assert(
    override.revokedAt === downgradeAt.toISOString() && revokedBy === owner.id,
    'Role downgrade did not revoke an incompatible override with attribution',
  )
}

// The role and every automatic revocation share the account-update audit transaction.
const downgradeRollback = await prepareCadreWithIncompatibleOverrides(
  owner,
  'downgrade-rollback',
)
const downgradeRollbackBefore = await readAccount(downgradeRollback.accountId)
const downgradeRollbackRequestId = `membership-downgrade-rollback-${runId}`
const createBeforeDowngradeRollback = payload.create
payload.create = (async (options) => {
  const data = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    data.requestId === downgradeRollbackRequestId
  ) {
    throw new Error('intentional downgrade audit failure')
  }
  return createBeforeDowngradeRollback.call(payload, options as never)
}) as typeof payload.create
try {
  await updateAccount(
    payload,
    await requestFor(owner, downgradeRollbackRequestId),
    downgradeRollback.accountId,
    {
      expectedVersion: downgradeRollback.accountVersion,
      reason: '虚构角色降级审计回滚验证',
      role: 'member',
    },
    { now: new Date(), requestId: downgradeRollbackRequestId },
  )
  throw new Error('Role downgrade unexpectedly survived audit failure')
} catch (error) {
  assert(
    error instanceof Error &&
      error.message === 'intentional downgrade audit failure',
    'Role downgrade audit failure was not propagated',
  )
} finally {
  payload.create = createBeforeDowngradeRollback
}
const downgradeRollbackAfter = await readAccount(downgradeRollback.accountId)
assert(
  downgradeRollbackAfter.role === downgradeRollbackBefore.role &&
    downgradeRollbackAfter.recordVersion ===
      downgradeRollbackBefore.recordVersion,
  'Audit failure did not roll back the role downgrade and account CAS',
)
for (const overrideId of downgradeRollback.overrideIds) {
  const override = await readOverride(overrideId)
  assert(
    !override.revokedAt && !override.revokedBy,
    'Audit failure did not roll back an automatic override revocation',
  )
}
assert(
  (await auditCount(downgradeRollbackRequestId)) === 0,
  'Failed role downgrade left an audit event',
)

// Same-key submissions must serialize before the account password/CAS write.
const concurrentFixture = nextFixture('same-key')
const concurrentPreconfigured = await preconfigureMemberAccountClaim(
  payload,
  await requestFor(owner, `membership-same-key-preconfigure-${runId}`),
  {
    actorId: owner.id,
    audit,
    command: {
      member: {
        mode: 'create',
        offlineInterviewConfirmed: true,
        profile: {
          contacts: [
            {
              isPrimary: true,
              label: null,
              type: 'wechat',
              value: concurrentFixture.contact,
            },
          ],
          major: null,
          membershipIdentity: 'member',
          name: concurrentFixture.name,
          source: 'offlineInterview',
          studentNumber: concurrentFixture.studentNumber,
        },
      },
      overrides: [],
      role: 'member',
    },
    identity,
    now: new Date(),
    requestId: `membership-same-key-preconfigure-${runId}`,
  },
)
const sameKey = randomUUID()
const sameKeyCommand = {
  contacts: [
    {
      isPrimary: true,
      label: null,
      type: 'wechat' as const,
      value: concurrentFixture.contact,
    },
  ],
  name: concurrentFixture.name,
  major: null,
  membershipIdentity: 'member' as const,
  password: concurrentFixture.password,
  passwordConfirmation: concurrentFixture.password,
  studentNumber: concurrentFixture.studentNumber,
}
const sameKeyRequests = await Promise.all([
  requestFor(null, `membership-same-key-a-${runId}`),
  requestFor(null, `membership-same-key-b-${runId}`),
])
const beforeSameKeyAccount = await readAccount(
  concurrentPreconfigured.accountId,
)
const sameKeyResults = await Promise.allSettled(
  sameKeyRequests.map((req, index) =>
    submitAccountClaim(payload, req, {
      audit,
      command: sameKeyCommand,
      fingerprintKey: `membership-fingerprint-${runId}`,
      idempotencyKey: sameKey,
      identity,
      now: new Date(),
      requestId: `membership-same-key-${index}-${runId}`,
    }),
  ),
)
assert(
  sameKeyResults.every((result) => result.status === 'fulfilled'),
  'Concurrent same-key replay did not fulfill both requests',
)
const sameKeyValues = sameKeyResults.map((result) => {
  assert(result.status === 'fulfilled', 'Concurrent replay result disappeared')
  return result.value
})
assert(
  sameKeyValues[0]?.outcome === 'pendingReview' &&
    sameKeyValues[1]?.outcome === 'pendingReview' &&
    sameKeyValues[0].claimId === sameKeyValues[1].claimId &&
    sameKeyValues[0].requestId === sameKeyValues[1].requestId,
  'Concurrent same-key replay did not return the original result',
)
const afterSameKeyAccount = await readAccount(concurrentPreconfigured.accountId)
assert(
  afterSameKeyAccount.recordVersion === beforeSameKeyAccount.recordVersion + 1,
  'Concurrent same-key replay rewrote the account more than once',
)
const sameKeyClaims = await payload.find({
  collection: 'account-claims',
  limit: 10,
  overrideAccess: true,
  pagination: false,
  where: { member: { equals: concurrentPreconfigured.memberId } },
})
assert(
  sameKeyClaims.totalDocs === 1,
  'Concurrent same-key replay created duplicates',
)

// Two terminal reviews may race, but only one may commit.
const doubleReview = await prepareClaim(owner, 'double-review')
const doubleClaim = await readClaim(doubleReview.claimId)
const doubleAccount = await readAccount(doubleReview.accountId)
const doubleReviewReqs = await Promise.all([
  requestFor(owner, `membership-double-approve-${runId}`),
  requestFor(owner, `membership-double-reject-${runId}`),
])
const doubleResults = await Promise.allSettled([
  approveAccountClaim(payload, doubleReviewReqs[0]!, doubleReview.claimId, {
    audit,
    command: {
      confirmCurrentAuthorization: false,
      expectedAccountVersion: doubleAccount.recordVersion,
      expectedClaimVersion: doubleClaim.recordVersion,
    },
    identity,
    now: new Date(),
    requestId: `membership-double-approve-${runId}`,
  }),
  rejectAccountClaim(payload, doubleReviewReqs[1]!, doubleReview.claimId, {
    audit,
    command: {
      expectedAccountVersion: doubleAccount.recordVersion,
      expectedClaimVersion: doubleClaim.recordVersion,
      reason: 'insufficientEvidence',
    },
    identity,
    now: new Date(),
    requestId: `membership-double-reject-${runId}`,
  }),
])
expectOneConflict(doubleResults, 'Double review')
const doubleAfter = await readClaim(doubleReview.claimId)
assert(
  ['approved', 'rejected'].includes(doubleAfter.status),
  'Double review did not end in one terminal state',
)
assert(
  (await auditCount(`membership-double-approve-${runId}`)) +
    (await auditCount(`membership-double-reject-${runId}`)) ===
    1,
  'Double review wrote an invalid number of terminal audits',
)

async function assertAccountManagementRace(kind: 'override' | 'role') {
  const fixture = await prepareClaim(owner, `${kind}-race`)
  const claim = await readClaim(fixture.claimId)
  const account = await readAccount(fixture.accountId)
  const [reviewReq, managementReq] = await Promise.all([
    requestFor(owner, `membership-${kind}-review-${runId}`),
    requestFor(owner, `membership-${kind}-management-${runId}`),
  ])
  const management =
    kind === 'role'
      ? updateAccount(
          payload,
          managementReq,
          fixture.accountId,
          {
            expectedVersion: account.recordVersion,
            reason: '虚构审核并发角色修改',
            role: 'staff',
          },
          { now: new Date(), requestId: `membership-role-management-${runId}` },
        )
      : setPermissionOverride(
          payload,
          managementReq,
          fixture.accountId,
          {
            effect: 'allow',
            expectedVersion: account.recordVersion,
            expiresAt: null,
            permission: 'content.create',
            reason: '虚构审核并发显式权限',
            recruitmentCycleId: null,
            scopeType: 'global',
          },
          {
            now: new Date(),
            requestId: `membership-override-management-${runId}`,
          },
        )
  const results = await Promise.allSettled([
    approveAccountClaim(payload, reviewReq, fixture.claimId, {
      audit,
      command: {
        confirmCurrentAuthorization: false,
        expectedAccountVersion: account.recordVersion,
        expectedClaimVersion: claim.recordVersion,
      },
      identity,
      now: new Date(),
      requestId: `membership-${kind}-review-${runId}`,
    }),
    management,
  ])
  expectOneConflict(results, `Review versus ${kind}`)
  const afterClaim = await readClaim(fixture.claimId)
  const afterAccount = await readAccount(fixture.accountId)
  if (afterClaim.status === 'approved') {
    assert(afterAccount.status === 'active', `${kind} race left mixed approval`)
    assert(
      kind !== 'role' || afterAccount.role === 'member',
      'Role race committed a losing role update',
    )
    if (kind === 'override') {
      const overrides = await payload.count({
        collection: 'permission-overrides',
        overrideAccess: true,
        where: { user: { equals: fixture.accountId } },
      })
      assert(
        overrides.totalDocs === 0,
        'Override race committed a losing override',
      )
    }
  } else {
    assert(
      afterClaim.status === 'pendingReview' &&
        afterAccount.status === 'pendingApproval',
      `${kind} race left a mixed pending state`,
    )
    assert(
      kind !== 'role' || afterAccount.role === 'staff',
      'Role race lost its only committed update',
    )
    if (kind === 'override') {
      const overrides = await payload.count({
        collection: 'permission-overrides',
        overrideAccess: true,
        where: {
          and: [
            { user: { equals: fixture.accountId } },
            { permission: { equals: 'content.create' } },
            { revokedAt: { exists: false } },
          ],
        },
      })
      assert(
        overrides.totalDocs === 1,
        'Override race lost its only committed update',
      )
    }
  }
}

await assertAccountManagementRace('role')
await assertAccountManagementRace('override')

// Audit failure must roll back the account, claim, Member and audit atomically.
const rollback = await prepareClaim(owner, 'rollback')
const rollbackClaimBefore = await readClaim(rollback.claimId)
const rollbackAccountBefore = await readAccount(rollback.accountId)
const rollbackMemberBefore = await readMember(rollback.memberId)
const rollbackRequestId = `membership-rollback-${runId}`
const originalCreate = payload.create
payload.create = (async (options) => {
  const data = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    data.requestId === rollbackRequestId
  ) {
    throw new Error('intentional membership audit failure')
  }
  return originalCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await approveAccountClaim(
    payload,
    await requestFor(owner, rollbackRequestId),
    rollback.claimId,
    {
      audit,
      command: {
        confirmCurrentAuthorization: false,
        expectedAccountVersion: rollbackAccountBefore.recordVersion,
        expectedClaimVersion: rollbackClaimBefore.recordVersion,
      },
      identity,
      now: new Date(),
      requestId: rollbackRequestId,
    },
  )
  throw new Error('Membership review unexpectedly survived audit failure')
} catch (error) {
  assert(
    error instanceof Error &&
      error.message === 'intentional membership audit failure',
    'Membership audit failure was not propagated',
  )
} finally {
  payload.create = originalCreate
}
const rollbackClaimAfter = await readClaim(rollback.claimId)
const rollbackAccountAfter = await readAccount(rollback.accountId)
const rollbackMemberAfter = await readMember(rollback.memberId)
assert(
  rollbackClaimAfter.status === rollbackClaimBefore.status &&
    rollbackClaimAfter.recordVersion === rollbackClaimBefore.recordVersion,
  'Audit failure did not roll back the Claim',
)
assert(
  rollbackAccountAfter.status === rollbackAccountBefore.status &&
    rollbackAccountAfter.recordVersion === rollbackAccountBefore.recordVersion,
  'Audit failure did not roll back the AuthUser',
)
assert(
  rollbackMemberAfter.recordVersion === rollbackMemberBefore.recordVersion &&
    JSON.stringify(rollbackMemberAfter.contacts) ===
      JSON.stringify(rollbackMemberBefore.contacts),
  'Audit failure did not roll back the Member',
)
assert(
  (await auditCount(rollbackRequestId)) === 0,
  'Audit failure left an audit',
)

const concurrentPreconfigureFixture = nextFixture('double-preconfigure')
const concurrentPreconfigureRequestIds = [
  `membership-double-preconfigure-a-${runId}`,
  `membership-double-preconfigure-b-${runId}`,
]
const concurrentPreconfigureResults = await Promise.allSettled(
  concurrentPreconfigureRequestIds.map(async (requestId) =>
    preconfigureMemberAccountClaim(
      payload,
      await requestFor(owner, requestId),
      {
        actorId: owner.id,
        audit,
        command: {
          member: {
            mode: 'create',
            offlineInterviewConfirmed: true,
            profile: {
              contacts: [
                {
                  isPrimary: true,
                  label: null,
                  type: 'wechat',
                  value: concurrentPreconfigureFixture.contact,
                },
              ],
              major: null,
              membershipIdentity: 'member',
              name: concurrentPreconfigureFixture.name,
              source: 'offlineInterview',
              studentNumber: concurrentPreconfigureFixture.studentNumber,
            },
          },
          overrides: [],
          role: 'member',
        },
        identity,
        now: new Date(),
        requestId,
      },
    ),
  ),
)
expectOneConflict(
  concurrentPreconfigureResults,
  'Concurrent preconfiguration for one student number',
)
const concurrentPreconfigureMembers = await payload.find({
  collection: 'members',
  overrideAccess: true,
  pagination: false,
  where: {
    studentNumber: { equals: concurrentPreconfigureFixture.studentNumber },
  },
})
const concurrentPreconfigureAccounts = await payload.find({
  collection: 'auth-users',
  overrideAccess: true,
  pagination: false,
  showHiddenFields: true,
  where: {
    studentNumber: { equals: concurrentPreconfigureFixture.studentNumber },
  },
})
assert(
  concurrentPreconfigureMembers.docs.length === 1 &&
    concurrentPreconfigureAccounts.docs.length === 1,
  'Concurrent preconfiguration left duplicate or missing Member/AuthUser rows',
)
const preconfiguredMember = concurrentPreconfigureMembers.docs[0]
const preconfiguredAccount = concurrentPreconfigureAccounts.docs[0]
const preconfiguredAuthUserId =
  typeof preconfiguredMember?.authUser === 'string'
    ? preconfiguredMember.authUser
    : preconfiguredMember?.authUser?.id
assert(
  preconfiguredAuthUserId === preconfiguredAccount?.id,
  'Concurrent preconfiguration left an orphan Member/AuthUser relationship',
)
assert(
  (await auditCount(concurrentPreconfigureRequestIds[0]!)) +
    (await auditCount(concurrentPreconfigureRequestIds[1]!)) ===
    1,
  'Concurrent preconfiguration left duplicate or orphan audit events',
)

const concurrentIntakeFixture = nextFixture('double-intake')
const intakeSubmissions = await Promise.all(
  ['a', 'b'].map(async (label) => {
    const requestId = `membership-double-intake-submit-${label}-${runId}`
    return submitMemberIntake(payload, await requestFor(null, requestId), {
      audit,
      command: {
        contacts: [
          {
            isPrimary: true,
            label: null,
            type: 'wechat',
            value: `${concurrentIntakeFixture.contact}-${label}`,
          },
        ],
        major: null,
        membershipIdentity: 'member',
        name: `${concurrentIntakeFixture.name}${label}`,
        privacyPurposeConfirmed: true,
        studentNumber: concurrentIntakeFixture.studentNumber,
      },
      fingerprintKey: `membership-fingerprint-${runId}`,
      idempotencyKey: randomUUID(),
      now: new Date(),
      requestId,
    })
  }),
)
const concurrentIntakeReviewRequestIds = [
  `membership-double-intake-review-a-${runId}`,
  `membership-double-intake-review-b-${runId}`,
]
const concurrentIntakeResults = await Promise.allSettled(
  intakeSubmissions.map(async (submission, index) =>
    approveMemberIntake(
      payload,
      await requestFor(owner, concurrentIntakeReviewRequestIds[index]!),
      submission.intakeId,
      {
        audit,
        command: {
          adoptApplicationProfile: false,
          expectedVersion: 1,
          member: { mode: 'create' },
        },
        now: new Date(),
        requestId: concurrentIntakeReviewRequestIds[index]!,
      },
    ),
  ),
)
expectOneConflict(
  concurrentIntakeResults,
  'Concurrent Intake reviews for one student number',
)
const concurrentIntakeMembers = await payload.find({
  collection: 'members',
  overrideAccess: true,
  pagination: false,
  where: { studentNumber: { equals: concurrentIntakeFixture.studentNumber } },
})
const concurrentIntakeAccounts = await payload.find({
  collection: 'auth-users',
  overrideAccess: true,
  pagination: false,
  showHiddenFields: true,
  where: { studentNumber: { equals: concurrentIntakeFixture.studentNumber } },
})
const concurrentIntakes = await Promise.all(
  intakeSubmissions.map((submission) =>
    payload.findByID({
      collection: 'member-intake-applications',
      id: submission.intakeId,
      overrideAccess: true,
    }),
  ),
)
assert(
  concurrentIntakeMembers.docs.length === 1 &&
    concurrentIntakeAccounts.docs.length === 0,
  'Concurrent Intake reviews left duplicate Members or an AuthUser',
)
assert(
  concurrentIntakes.filter((intake) => intake.status === 'approved').length ===
    1 &&
    concurrentIntakes.filter((intake) => intake.status === 'pendingReview')
      .length === 1,
  'Concurrent Intake reviews did not leave one approved and one retryable Intake',
)
const approvedIntake = concurrentIntakes.find(
  (intake) => intake.status === 'approved',
)
const approvedIntakeMemberId =
  typeof approvedIntake?.member === 'string'
    ? approvedIntake.member
    : approvedIntake?.member?.id
assert(
  approvedIntakeMemberId === concurrentIntakeMembers.docs[0]?.id,
  'Concurrent Intake reviews left an orphan Member relationship',
)
assert(
  (await auditCount(concurrentIntakeReviewRequestIds[0]!)) +
    (await auditCount(concurrentIntakeReviewRequestIds[1]!)) ===
    1,
  'Concurrent Intake reviews left duplicate or orphan review audits',
)

// Public status, receipt rotation, message CAS, and audit rollback use real PG transactions.
const statusFixture = await prepareClaim(owner, 'status-recovery')
const statusAccountBefore = await readAccount(statusFixture.accountId)
const statusClaimBefore = await readClaim(statusFixture.claimId)
await approveAccountClaim(
  payload,
  await requestFor(owner, `membership-status-approve-${runId}`),
  statusFixture.claimId,
  {
    audit,
    command: {
      confirmCurrentAuthorization: false,
      expectedAccountVersion: statusAccountBefore.recordVersion,
      expectedClaimVersion: statusClaimBefore.recordVersion,
    },
    identity,
    now: new Date(),
    requestId: `membership-status-approve-${runId}`,
  },
)
const publicStatus = await queryMembershipStatus(
  payload,
  await requestFor(null, `membership-status-read-${runId}`),
  {
    identity,
    now: new Date(),
    receipt: statusFixture.statusReceipt,
    receiptKey: `membership-fingerprint-${runId}`,
    requestId: `membership-status-read-${runId}`,
  },
)
assert(
  publicStatus.status === 'approvedCanLogin',
  'Approved Claim did not expose the coarse login-ready status',
)
const approvedStatusClaim = await readClaim(statusFixture.claimId)
const receiptRequestIds = [
  `membership-status-reissue-a-${runId}`,
  `membership-status-reissue-b-${runId}`,
]
const receiptResults = await Promise.allSettled(
  receiptRequestIds.map(async (requestId) =>
    reissueMembershipStatusReceipt(
      payload,
      await requestFor(owner, requestId),
      'claim',
      statusFixture.claimId,
      {
        audit,
        command: {
          expectedVersion: approvedStatusClaim.recordVersion,
          reason: '虚构查询凭证并发重签',
        },
        identity,
        now: new Date(),
        receiptKey: `membership-fingerprint-${runId}`,
        requestId,
      },
    ),
  ),
)
expectOneConflict(receiptResults, 'Concurrent status receipt reissue')
const receiptWinner = receiptResults.find(
  (
    result,
  ): result is PromiseFulfilledResult<{
    recordVersion: number
    statusReceipt: string
    statusReceiptExpiresAt: string
  }> => result.status === 'fulfilled',
)
assert(receiptWinner, 'Status receipt reissue winner is missing')
try {
  await queryMembershipStatus(
    payload,
    await requestFor(null, `membership-status-old-${runId}`),
    {
      identity,
      now: new Date(),
      receipt: statusFixture.statusReceipt,
      receiptKey: `membership-fingerprint-${runId}`,
      requestId: `membership-status-old-${runId}`,
    },
  )
  throw new Error('Old status receipt remained valid after reissue')
} catch (error) {
  assert(
    error instanceof BusinessError && error.code === 'NOT_FOUND',
    'Old status receipt did not fail through the uniform NOT_FOUND facade',
  )
}
const messageResults = await Promise.allSettled(
  ['a', 'b'].map(async (label) =>
    updateMembershipPublicMessage(
      payload,
      await requestFor(owner, `membership-message-${label}-${runId}`),
      'claim',
      statusFixture.claimId,
      {
        audit,
        command: {
          expectedVersion: receiptWinner.value.recordVersion,
          publicMessage: `虚构申请人可见留言 ${label}`,
          reason: '虚构公开留言并发更新',
        },
        identity,
        now: new Date(),
        requestId: `membership-message-${label}-${runId}`,
      },
    ),
  ),
)
expectOneConflict(messageResults, 'Concurrent public message update')
const messageBeforeRollback = await readClaim(statusFixture.claimId)
const messageRollbackRequestId = `membership-message-rollback-${runId}`
const createBeforeMessageRollback = payload.create
payload.create = (async (options) => {
  const data = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    data.requestId === messageRollbackRequestId
  ) {
    throw new Error('intentional public message audit failure')
  }
  return createBeforeMessageRollback.call(payload, options as never)
}) as typeof payload.create
try {
  await updateMembershipPublicMessage(
    payload,
    await requestFor(owner, messageRollbackRequestId),
    'claim',
    statusFixture.claimId,
    {
      audit,
      command: {
        expectedVersion: messageBeforeRollback.recordVersion,
        publicMessage: '此虚构留言必须回滚',
        reason: '虚构审计回滚',
      },
      identity,
      now: new Date(),
      requestId: messageRollbackRequestId,
    },
  )
  throw new Error('Public message update survived audit failure')
} catch (error) {
  assert(
    error instanceof Error &&
      error.message === 'intentional public message audit failure',
    'Public message audit failure was not propagated',
  )
} finally {
  payload.create = createBeforeMessageRollback
}
const messageAfterRollback = await readClaim(statusFixture.claimId)
assert(
  messageAfterRollback.recordVersion === messageBeforeRollback.recordVersion &&
    messageAfterRollback.publicMessage === messageBeforeRollback.publicMessage,
  'Audit failure did not roll back public message and recordVersion',
)

// A target role elevation owns the canonical account lock; the waiting Claim
// operation must re-read the role in its transaction and make zero writes.
const targetRoleFixture = await prepareClaim(owner, 'status-target-role')
const targetRoleAccountBefore = await readAccount(targetRoleFixture.accountId)
const targetRoleClaimBeforeReview = await readClaim(targetRoleFixture.claimId)
await approveAccountClaim(
  payload,
  await requestFor(owner, `membership-target-role-approve-${runId}`),
  targetRoleFixture.claimId,
  {
    audit,
    command: {
      confirmCurrentAuthorization: false,
      expectedAccountVersion: targetRoleAccountBefore.recordVersion,
      expectedClaimVersion: targetRoleClaimBeforeReview.recordVersion,
    },
    identity,
    now: new Date(),
    requestId: `membership-target-role-approve-${runId}`,
  },
)
const targetRoleAccount = await readAccount(targetRoleFixture.accountId)
const targetRoleClaim = await readClaim(targetRoleFixture.claimId)
const targetRoleMessageRequestId = `membership-target-role-message-${runId}`
let signalRoleWrite!: () => void
let releaseRoleWrite!: () => void
const roleWriteEntered = new Promise<void>((resolve) => {
  signalRoleWrite = resolve
})
const roleWriteReleased = new Promise<void>((resolve) => {
  releaseRoleWrite = resolve
})
const updateBeforeTargetRoleRace = payload.update
payload.update = (async (options) => {
  const data = options.data as { role?: unknown }
  if (
    options.collection === 'auth-users' &&
    options.id === targetRoleFixture.accountId &&
    data.role === 'admin'
  ) {
    signalRoleWrite()
    await roleWriteReleased
  }
  return updateBeforeTargetRoleRace.call(payload, options as never)
}) as typeof payload.update
const roleElevation = updateAccount(
  payload,
  await requestFor(owner, `membership-target-role-elevate-${runId}`),
  targetRoleFixture.accountId,
  {
    expectedVersion: targetRoleAccount.recordVersion,
    reason: '虚构后续操作并发目标角色提升',
    role: 'admin',
  },
  {
    now: new Date(),
    requestId: `membership-target-role-elevate-${runId}`,
  },
)
await roleWriteEntered
const blockedTargetMessage = updateMembershipPublicMessage(
  payload,
  await requestFor(admin, targetRoleMessageRequestId),
  'claim',
  targetRoleFixture.claimId,
  {
    audit,
    command: {
      expectedVersion: targetRoleClaim.recordVersion,
      publicMessage: '此虚构留言不得写入',
      reason: '虚构并发目标角色上限验证',
    },
    identity,
    now: new Date(),
    requestId: targetRoleMessageRequestId,
  },
)
releaseRoleWrite()
try {
  await roleElevation
  await blockedTargetMessage
  throw new Error('Admin changed an elevated admin target Claim')
} catch (error) {
  assert(
    error instanceof BusinessError &&
      error.code === 'FORBIDDEN' &&
      error.status === 403,
    'Role elevation race did not deny the waiting admin Claim operation',
  )
} finally {
  payload.update = updateBeforeTargetRoleRace
}
const targetRoleClaimAfter = await readClaim(targetRoleFixture.claimId)
assert(
  targetRoleClaimAfter.recordVersion === targetRoleClaim.recordVersion &&
    targetRoleClaimAfter.publicMessage === targetRoleClaim.publicMessage,
  'Denied elevated-target operation changed Claim data or version',
)
assert(
  (await auditCount(targetRoleMessageRequestId)) === 0,
  'Denied elevated-target operation wrote an AuditEvent',
)

const recoveryFixture = await prepareClaim(owner, 'credential-recovery')
const recoveryAccountBefore = await readAccount(recoveryFixture.accountId)
const recoveryClaimBefore = await readClaim(recoveryFixture.claimId)
await convertMemberClaimToDirect(
  payload,
  await requestFor(owner, `membership-recovery-convert-${runId}`),
  recoveryFixture.accountId,
  {
    audit,
    command: {
      claimId: recoveryFixture.claimId,
      confirmEffects: true,
      expectedAccountVersion: recoveryAccountBefore.recordVersion,
      expectedClaimVersion: recoveryClaimBefore.recordVersion,
      reason: 'applicantRequest',
    },
    identity,
    now: new Date(),
    requestId: `membership-recovery-convert-${runId}`,
  },
)
const convertedAccount = await readAccount(recoveryFixture.accountId)
const convertedClaim = await readClaim(recoveryFixture.claimId)
const recoveryRace = await Promise.allSettled([
  reissuePendingActivationCredential(
    payload,
    await requestFor(owner, `membership-recovery-reissue-${runId}`),
    recoveryFixture.accountId,
    {
      expectedVersion: convertedAccount.recordVersion,
      reason: '虚构临时凭证恢复竞态',
    },
    { now: new Date(), requestId: `membership-recovery-reissue-${runId}` },
  ),
  withdrawMemberClaimConversion(
    payload,
    await requestFor(owner, `membership-recovery-withdraw-${runId}`),
    recoveryFixture.claimId,
    {
      audit,
      command: {
        confirmEffects: true,
        expectedAccountVersion: convertedAccount.recordVersion,
        expectedClaimVersion: convertedClaim.recordVersion,
        reason: '虚构转换撤回竞态',
      },
      identity,
      now: new Date(),
      requestId: `membership-recovery-withdraw-${runId}`,
    },
  ),
])
expectOneConflict(
  recoveryRace,
  'Credential reissue versus conversion withdrawal',
)
const recoveryAccountAfter = await readAccount(recoveryFixture.accountId)
const recoveryClaimAfter = await readClaim(recoveryFixture.claimId)
assert(
  (recoveryAccountAfter.status === 'pendingActivation' &&
    !recoveryClaimAfter.conversionWithdrawnAt) ||
    (recoveryAccountAfter.status === 'pendingClaim' &&
      Boolean(recoveryClaimAfter.conversionWithdrawnAt)),
  'Credential recovery race left mixed account/Claim state',
)

console.log(
  `Membership account claim PostgreSQL verification passed: same-key replay, double review, role/override races, Claim target-role lock, status receipt/message CAS, credential recovery race, audit rollback and concurrent Member creation (${runId})`,
)
process.exit(0)
