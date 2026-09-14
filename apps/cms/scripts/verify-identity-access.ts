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
  changeAccountState,
  createAccount,
  updateAccount,
} from '../src/modules/identity-access/use-cases/accounts'
import { activateAccount } from '../src/modules/identity-access/use-cases/activate'
import { changeOwnPassword } from '../src/modules/identity-access/use-cases/self-service'
import {
  revokePermissionOverride,
  setPermissionOverride,
} from '../src/modules/identity-access/use-cases/permission-overrides'
import {
  activationSchema,
  selfPasswordSchema,
} from '../src/modules/identity-access/schemas'
import { BusinessError } from '../src/modules/shared/business-error'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Identity access verification may only use local ascnucc_demo_test',
  )
}

const payload = await getPayload({ config })
const runId = randomUUID()
const usernameEntropy = runId.replaceAll('-', '').slice(0, 20)
const fixtureUsernames = new Set<string>()
let fixtureUsernameSequence = 0
const now = new Date()
const fixturePassword = 'Local-Identity-Owner-2026!'

type LoginResult = Awaited<ReturnType<typeof payload.login>>

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function fixtureUsername(scenario: string): string {
  fixtureUsernameSequence += 1
  const scenarioPrefix = scenario.replaceAll(/[^a-z0-9]/g, '').slice(0, 5)
  const username = `i${fixtureUsernameSequence}-${scenarioPrefix}-${usernameEntropy}`
  if (
    username.length > 32 ||
    !/^[a-z][a-z0-9._-]{2,31}$/.test(username) ||
    fixtureUsernames.has(username)
  ) {
    throw new Error('Identity fixture username invariant failed')
  }
  fixtureUsernames.add(username)
  return username
}

async function assertM009Schema(): Promise<void> {
  const result = await payload.db.pool.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'auth_users'
        AND column_name IN (
          'account_type', 'student_number', 'status',
          'default_role_expires_at', 'temporary_credential_expires_at',
          'record_version'
        )`,
  )
  const columns = new Set(result.rows.map((row) => row.column_name))
  const required = [
    'account_type',
    'student_number',
    'status',
    'default_role_expires_at',
    'temporary_credential_expires_at',
    'record_version',
  ]
  const missing = required.filter((column) => !columns.has(column))
  if (missing.length > 0) {
    throw new Error(
      `M009 identity schema is not applied; missing auth_users columns: ${missing.join(', ')}`,
    )
  }
}

async function createFixtureUser(
  suffix: string,
  role: AuthUser['role'],
  password = fixturePassword,
): Promise<AuthUser> {
  return payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'external',
      defaultRoleExpiresAt: null,
      displayName: `虚构身份验证账号 ${suffix}`,
      password,
      recordVersion: 1,
      role,
      status: 'active',
      studentNumber: null,
      temporaryCredentialExpiresAt: null,
      username: fixtureUsername(suffix),
    },
    overrideAccess: true,
    showHiddenFields: true,
  })
}

async function login(username: string, password: string): Promise<LoginResult> {
  return payload.login({
    collection: 'auth-users',
    data: { password, username },
    overrideAccess: true,
    showHiddenFields: true,
  })
}

async function authWithToken(token: null | string | undefined) {
  if (!token) return null
  const result = await payload.auth({
    headers: new Headers({ authorization: `Bearer ${token}` }),
  })
  return result.user
}

async function requestForUser(
  user: AuthUser | NonNullable<Awaited<ReturnType<typeof authWithToken>>>,
  requestId: string,
): Promise<PayloadRequest> {
  return createLocalReq(
    {
      req: { headers: new Headers({ 'x-request-id': requestId }) },
      user: { ...user, collection: 'auth-users' } as TypedUser,
    },
    payload,
  )
}

async function requestForToken(
  token: null | string | undefined,
  requestId: string,
): Promise<PayloadRequest> {
  const user = await authWithToken(token)
  assert(user, `Token for ${requestId} was not authenticated`)
  return requestForUser(user, requestId)
}

async function expectLoginRejected(username: string, password: string) {
  try {
    await login(username, password)
  } catch {
    return
  }
  throw new Error(`Login unexpectedly succeeded for ${username}`)
}

async function expectBusinessError(
  operation: () => Promise<unknown>,
  status: number,
  label: string,
): Promise<BusinessError> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof BusinessError && error.status === status) return error
    throw error
  }
  throw new Error(`${label} unexpectedly succeeded`)
}

async function readUser(id: string): Promise<AuthUser> {
  return payload.findByID({
    collection: 'auth-users',
    id,
    overrideAccess: true,
    showHiddenFields: true,
  })
}

function stateSnapshot(user: AuthUser) {
  return {
    hash: user.hash ?? null,
    recordVersion: user.recordVersion,
    role: user.role,
    salt: user.salt ?? null,
    sessionIds: (user.sessions ?? []).map((session) => session.id).sort(),
    status: user.status,
    temporaryCredentialExpiresAt: user.temporaryCredentialExpiresAt ?? null,
  }
}

async function auditCount(targetId: string): Promise<number> {
  return (
    await payload.count({
      collection: 'audit-events',
      overrideAccess: true,
      where: { targetId: { equals: targetId } },
    })
  ).totalDocs
}

async function activeOverrideCount(targetId: string): Promise<number> {
  return (
    await payload.count({
      collection: 'permission-overrides',
      overrideAccess: true,
      where: {
        and: [{ user: { equals: targetId } }, { revokedAt: { exists: false } }],
      },
    })
  ).totalDocs
}

async function readOverride(id: string) {
  return payload.findByID({
    collection: 'permission-overrides',
    id,
    overrideAccess: true,
  })
}

async function overrideRowsSnapshot(targetId: string): Promise<string> {
  const result = await payload.find({
    collection: 'permission-overrides',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    pagination: false,
    sort: 'id',
    where: { user: { equals: targetId } },
  })
  return JSON.stringify(result.docs)
}

async function assertNoSessions(id: string, label: string) {
  const user = await readUser(id)
  assert((user.sessions ?? []).length === 0, `${label} left Payload sessions`)
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value)
  else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, output)
  }
  return output
}

function assertNoSecretFields(value: unknown, label: string) {
  const forbidden = new Set([
    'hash',
    'salt',
    'sessions',
    'password',
    'resetPasswordToken',
    'resetPasswordExpiration',
    'token',
  ])
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(visit)
      return
    }
    if (!current || typeof current !== 'object') return
    for (const [key, item] of Object.entries(current)) {
      assert(!forbidden.has(key), `${label} exposed forbidden field ${key}`)
      visit(item)
    }
  }
  visit(value)
}

async function assertAuditHasNoSecrets(targetIds: string[], secrets: string[]) {
  const audits = await payload.find({
    collection: 'audit-events',
    depth: 0,
    limit: 500,
    overrideAccess: true,
    pagination: false,
    where: { targetId: { in: targetIds } },
  })
  const serialized = JSON.stringify(audits.docs)
  for (const secret of secrets.filter(Boolean)) {
    assert(
      !serialized.includes(secret),
      'Audit data contains a credential or token',
    )
  }
  assertNoSecretFields(audits.docs, 'Audit event')
}

async function assertConcurrentTerminalState(input: {
  action: 'disable' | 'reset'
  managerReq: PayloadRequest
  password: string
  user: AuthUser
}) {
  const before = await readUser(input.user.id)
  let racingToken: null | string | undefined
  const results = await Promise.allSettled([
    login(before.username, input.password).then((result) => {
      racingToken = result.token
      return result
    }),
    changeAccountState(
      payload,
      input.managerReq,
      before.id,
      input.action,
      {
        expectedVersion: before.recordVersion,
        reason: `并发 ${input.action} 探针`,
      },
      {
        now: new Date(),
        requestId: `identity-race-${input.action}-${runId}`,
      },
    ),
  ])
  const stateResult = results[1]
  assert(
    stateResult.status === 'fulfilled',
    `Concurrent ${input.action} did not reach its required terminal state`,
  )
  const after = await readUser(before.id)
  assert(
    after.status ===
      (input.action === 'disable' ? 'disabled' : 'pendingActivation'),
    `Concurrent login overwrote ${input.action} account status`,
  )
  assert(
    (after.sessions ?? []).length === 0,
    `Concurrent ${input.action} left a session`,
  )
  if (racingToken) {
    assert(
      !(await authWithToken(racingToken)),
      `Concurrent login token survived ${input.action}`,
    )
  }
}

await assertM009Schema()

const owner = await createFixtureUser('owner', 'owner')
const ownerLogin = await login(owner.username, fixturePassword)
const ownerReq = await requestForToken(
  ownerLogin.token,
  `identity-owner-${runId}`,
)

const created = await createAccount(
  payload,
  ownerReq,
  {
    accountType: 'external',
    displayName: '虚构身份生命周期账号',
    loginName: fixtureUsername('lifecycle'),
    reason: '专项真实 Payload 验证',
    role: 'staff',
    studentNumber: null,
  },
  { now, requestId: `identity-create-${runId}` },
)
assertNoSecretFields(created.account, 'Account DTO')
assert(
  created.temporaryCredential.length > 0,
  'Creation did not return one-time credential',
)
await expectLoginRejected(
  created.account.loginName,
  created.temporaryCredential,
)
await assertNoSessions(created.account.id, 'Pending login rejection')

const activation11 = {
  loginName: created.account.loginName,
  newPassword: 'x'.repeat(11),
  newPasswordConfirmation: 'x'.repeat(11),
  temporaryCredential: created.temporaryCredential,
}
assert(
  !activationSchema.safeParse(activation11).success,
  '11-character password passed',
)
const activation129 = {
  ...activation11,
  newPassword: 'x'.repeat(129),
  newPasswordConfirmation: 'x'.repeat(129),
}
assert(
  !activationSchema.safeParse(activation129).success,
  '129-character password passed',
)
for (const [label, password, accepted] of [
  ['astral-11', '😀'.repeat(11), false],
  ['astral-12', '😀'.repeat(12), true],
  ['astral-128', '😀'.repeat(128), true],
  ['astral-129', '😀'.repeat(129), false],
] as const) {
  const activationAccepted = activationSchema.safeParse({
    ...activation11,
    newPassword: password,
    newPasswordConfirmation: password,
  }).success
  const selfAccepted = selfPasswordSchema.safeParse({
    currentPassword: 'fictional-current-password',
    expectedVersion: 1,
    newPassword: password,
    newPasswordConfirmation: password,
  }).success
  assert(
    activationAccepted === accepted && selfAccepted === accepted,
    `${label} code-point password boundary was evaluated inconsistently`,
  )
}

const password12 = 'A'.repeat(12)
await activateAccount(
  payload,
  await createLocalReq({ req: { headers: new Headers() } }, payload),
  activationSchema.parse({
    loginName: created.account.loginName,
    newPassword: password12,
    newPasswordConfirmation: password12,
    temporaryCredential: created.temporaryCredential,
  }),
  { now: new Date(), requestId: `identity-activate-${runId}` },
)
await assertNoSessions(created.account.id, 'Activation')
await expectLoginRejected(
  created.account.loginName,
  created.temporaryCredential,
)

const firstLogin = await login(created.account.loginName, password12)
const secondLogin = await login(created.account.loginName, password12)
assert(
  await authWithToken(firstLogin.token),
  'Ordinary login did not authenticate',
)
assert(
  await authWithToken(secondLogin.token),
  'Second ordinary login did not authenticate',
)

const activeActivationBefore = stateSnapshot(await readUser(created.account.id))
const activeActivationAudits = await auditCount(created.account.id)
await expectBusinessError(
  async () =>
    activateAccount(
      payload,
      await createLocalReq({ req: { headers: new Headers() } }, payload),
      activationSchema.parse({
        loginName: created.account.loginName,
        newPassword: 'Active-Activation-Must-Fail-2026!',
        newPasswordConfirmation: 'Active-Activation-Must-Fail-2026!',
        temporaryCredential: password12,
      }),
      {
        now: new Date(),
        requestId: `identity-active-activation-${runId}`,
      },
    ),
  401,
  'Active account activation with its formal password',
)
assert(
  JSON.stringify(stateSnapshot(await readUser(created.account.id))) ===
    JSON.stringify(activeActivationBefore),
  'Rejected active-account activation changed account state or sessions',
)
assert(
  (await auditCount(created.account.id)) === activeActivationAudits,
  'Rejected active-account activation wrote an audit event',
)

const beforeSelfChange = await readUser(created.account.id)
const observedSessionIds = (beforeSelfChange.sessions ?? []).map(
  (session) => session.id,
)
const password128 = 'P'.repeat(128)
assert(
  selfPasswordSchema.safeParse({
    currentPassword: password12,
    expectedVersion: beforeSelfChange.recordVersion,
    newPassword: password128,
    newPasswordConfirmation: password128,
  }).success,
  '128-character password was rejected',
)
await changeOwnPassword(
  payload,
  await requestForToken(firstLogin.token, `identity-self-password-${runId}`),
  {
    currentPassword: password12,
    expectedVersion: beforeSelfChange.recordVersion,
    newPassword: password128,
    newPasswordConfirmation: password128,
  },
  { now: new Date(), requestId: `identity-self-password-${runId}` },
)
assert(
  await authWithToken(firstLogin.token),
  'Self password change revoked current session',
)
assert(
  !(await authWithToken(secondLogin.token)),
  'Self password change retained another session',
)
await expectLoginRejected(created.account.loginName, password12)
const afterSelfLogin = await login(created.account.loginName, password128)

const stale = await readUser(created.account.id)
const staleSnapshot = stateSnapshot(stale)
const staleAudits = await auditCount(stale.id)
await expectBusinessError(
  () =>
    updateAccount(
      payload,
      ownerReq,
      stale.id,
      {
        displayName: '不应写入的冲突显示名',
        expectedVersion: stale.recordVersion - 1,
        reason: '版本冲突探针',
      },
      { now: new Date(), requestId: `identity-version-conflict-${runId}` },
    ),
  409,
  'Stale expectedVersion update',
)
assert(
  JSON.stringify(stateSnapshot(await readUser(stale.id))) ===
    JSON.stringify(staleSnapshot),
  'Version conflict changed account state',
)
assert(
  (await auditCount(stale.id)) === staleAudits,
  'Version conflict wrote audit',
)

const resetBefore = await readUser(created.account.id)
const reset = await changeAccountState(
  payload,
  ownerReq,
  resetBefore.id,
  'reset',
  { expectedVersion: resetBefore.recordVersion, reason: '重置验证' },
  { now: new Date(), requestId: `identity-reset-${runId}` },
)
assert(
  'temporaryCredential' in reset,
  'Reset did not return a temporary credential',
)
const resetCredential = reset.temporaryCredential
assert(typeof resetCredential === 'string', 'Reset credential is missing')
assertNoSecretFields(reset.account, 'Reset account DTO')
assert(
  !(await authWithToken(firstLogin.token)),
  'Reset retained the original session',
)
assert(
  !(await authWithToken(afterSelfLogin.token)),
  'Reset retained a later session',
)
await assertNoSessions(created.account.id, 'Reset')
await expectLoginRejected(created.account.loginName, resetCredential)

const resetPassword = 'Reset-Active-2026!'
await activateAccount(
  payload,
  await createLocalReq({ req: { headers: new Headers() } }, payload),
  {
    loginName: created.account.loginName,
    newPassword: resetPassword,
    newPasswordConfirmation: resetPassword,
    temporaryCredential: resetCredential,
  },
  { now: new Date(), requestId: `identity-reactivate-reset-${runId}` },
)
const beforeRollbackLogin = await login(
  created.account.loginName,
  resetPassword,
)

const rollbackBefore = await readUser(created.account.id)
const rollbackSnapshot = stateSnapshot(rollbackBefore)
const rollbackAuditCount = await auditCount(rollbackBefore.id)
const auditFailureRequestId = `identity-audit-failure-${runId}`
const originalCreate = payload.create
payload.create = (async (options) => {
  const data = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    data.requestId === auditFailureRequestId
  ) {
    throw new Error('intentional identity audit failure')
  }
  return originalCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await changeAccountState(
    payload,
    ownerReq,
    rollbackBefore.id,
    'disable',
    { expectedVersion: rollbackBefore.recordVersion, reason: '审计回滚探针' },
    { now: new Date(), requestId: auditFailureRequestId },
  )
  throw new Error('Identity change unexpectedly survived audit failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional identity audit failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalCreate
}
assert(
  JSON.stringify(stateSnapshot(await readUser(rollbackBefore.id))) ===
    JSON.stringify(rollbackSnapshot),
  'Audit failure did not roll back account and Session changes',
)
assert(
  (await auditCount(rollbackBefore.id)) === rollbackAuditCount,
  'Audit failure left an audit row',
)
assert(
  await authWithToken(beforeRollbackLogin.token),
  'Rollback lost the pre-existing session',
)

const disableBefore = await readUser(created.account.id)
await changeAccountState(
  payload,
  ownerReq,
  disableBefore.id,
  'disable',
  { expectedVersion: disableBefore.recordVersion, reason: '停用验证' },
  { now: new Date(), requestId: `identity-disable-${runId}` },
)
assert(
  !(await authWithToken(beforeRollbackLogin.token)),
  'Disable retained an old session',
)
await expectLoginRejected(created.account.loginName, resetPassword)
await assertNoSessions(created.account.id, 'Disable')

const disabled = await readUser(created.account.id)
const reenabled = await changeAccountState(
  payload,
  ownerReq,
  disabled.id,
  'reenable',
  { expectedVersion: disabled.recordVersion, reason: '重新启用验证' },
  { now: new Date(), requestId: `identity-reenable-${runId}` },
)
assert(
  'temporaryCredential' in reenabled,
  'Re-enable did not issue a credential',
)
const reenableCredential = reenabled.temporaryCredential
assert(
  typeof reenableCredential === 'string',
  'Re-enable credential is missing',
)
assertNoSecretFields(reenabled.account, 'Re-enable account DTO')
await expectLoginRejected(created.account.loginName, reenableCredential)
await assertNoSessions(created.account.id, 'Re-enable')

const admin = await createFixtureUser('admin-actor', 'admin')
const adminTarget = await createFixtureUser('admin-target', 'admin')
const adminLogin = await login(admin.username, fixturePassword)
const adminReq = await requestForToken(
  adminLogin.token,
  `identity-admin-${runId}`,
)
const escalationBefore = stateSnapshot(await readUser(adminTarget.id))
const escalationAudits = await auditCount(adminTarget.id)
await expectBusinessError(
  () =>
    updateAccount(
      payload,
      adminReq,
      adminTarget.id,
      {
        displayName: '不应被 admin 修改的 admin',
        expectedVersion: adminTarget.recordVersion,
        reason: '越级零变化探针',
      },
      { now: new Date(), requestId: `identity-escalation-${runId}` },
    ),
  403,
  'Admin-to-admin management escalation',
)
assert(
  JSON.stringify(stateSnapshot(await readUser(adminTarget.id))) ===
    JSON.stringify(escalationBefore),
  'Forbidden escalation changed target account',
)
assert(
  (await auditCount(adminTarget.id)) === escalationAudits,
  'Forbidden escalation wrote an audit event',
)

const overrideTarget = await createFixtureUser('override-target', 'staff')
const invalidCycleBefore = await readUser(overrideTarget.id)
const invalidCycleAuditBefore = await auditCount(overrideTarget.id)
const invalidCycleCountBefore = await activeOverrideCount(overrideTarget.id)
const invalidCycleError = await expectBusinessError(
  () =>
    setPermissionOverride(
      payload,
      ownerReq,
      overrideTarget.id,
      {
        effect: 'allow',
        expectedVersion: invalidCycleBefore.recordVersion,
        expiresAt: null,
        permission: 'recruitment.application.review',
        reason: '不存在届次验证',
        recruitmentCycleId: randomUUID(),
        scopeType: 'recruitmentCycle',
      },
      { now: new Date(), requestId: `identity-invalid-cycle-${runId}` },
    ),
  400,
  'Non-existent recruitment cycle override',
)
assert(
  invalidCycleError.code === 'VALIDATION_FAILED' &&
    JSON.stringify(invalidCycleError.details).includes('recruitmentCycleId'),
  'Invalid cycle did not return a stable recruitmentCycleId issue path',
)
assert(
  (await readUser(overrideTarget.id)).recordVersion ===
    invalidCycleBefore.recordVersion &&
    (await activeOverrideCount(overrideTarget.id)) ===
      invalidCycleCountBefore &&
    (await auditCount(overrideTarget.id)) === invalidCycleAuditBefore,
  'Invalid cycle override changed account, override, or audit state',
)

const roleLimitBefore = await readUser(adminTarget.id)
const roleLimitCountBefore = await activeOverrideCount(adminTarget.id)
await expectBusinessError(
  () =>
    setPermissionOverride(
      payload,
      adminReq,
      adminTarget.id,
      {
        effect: 'allow',
        expectedVersion: roleLimitBefore.recordVersion,
        expiresAt: null,
        permission: 'content.create',
        reason: '越级权限覆盖验证',
        recruitmentCycleId: null,
        scopeType: 'global',
      },
      { now: new Date(), requestId: `identity-override-limit-${runId}` },
    ),
  403,
  'Admin override on an admin target',
)
assert(
  (await readUser(adminTarget.id)).recordVersion ===
    roleLimitBefore.recordVersion &&
    (await activeOverrideCount(adminTarget.id)) === roleLimitCountBefore,
  'Forbidden override changed its target or override rows',
)

const validOverrideBefore = await readUser(overrideTarget.id)
const validOverrideAuditBefore = await auditCount(overrideTarget.id)
const validOverride = await setPermissionOverride(
  payload,
  ownerReq,
  overrideTarget.id,
  {
    effect: 'allow',
    expectedVersion: validOverrideBefore.recordVersion,
    expiresAt: null,
    permission: 'audit.read',
    reason: '有效权限覆盖验证',
    recruitmentCycleId: null,
    scopeType: 'global',
  },
  { now: new Date(), requestId: `identity-override-set-${runId}` },
)
assert(
  validOverride.accountVersion === validOverrideBefore.recordVersion + 1 &&
    (await activeOverrideCount(overrideTarget.id)) === 1 &&
    (await auditCount(overrideTarget.id)) === validOverrideAuditBefore + 1,
  'Valid override set did not atomically update version, row, and audit',
)
const validRevokeBefore = await readUser(overrideTarget.id)
const validRevokeAuditBefore = await auditCount(overrideTarget.id)
const validRevoke = await revokePermissionOverride(
  payload,
  ownerReq,
  overrideTarget.id,
  validOverride.overrideId,
  {
    expectedVersion: validRevokeBefore.recordVersion,
    reason: '有效权限撤销验证',
  },
  { now: new Date(), requestId: `identity-override-revoke-${runId}` },
)
const revokedDocument = await readOverride(validOverride.overrideId)
assert(
  validRevoke.accountVersion === validRevokeBefore.recordVersion + 1 &&
    Boolean(revokedDocument.revokedAt) &&
    (await activeOverrideCount(overrideTarget.id)) === 0 &&
    (await auditCount(overrideTarget.id)) === validRevokeAuditBefore + 1,
  'Valid override revoke did not atomically update version, history, and audit',
)

const realRecruitmentCycle = await payload.create({
  collection: 'recruitment-cycles',
  data: {
    code: `identity-${usernameEntropy}`,
    name: '虚构身份权限届次',
    status: 'draft',
  },
  overrideAccess: true,
})
const cycleOverrideTarget = await createFixtureUser(
  'override-cycle-valid',
  'staff',
)
const cycleSetAuditBefore = await auditCount(cycleOverrideTarget.id)
const cycleOverride = await setPermissionOverride(
  payload,
  ownerReq,
  cycleOverrideTarget.id,
  {
    effect: 'allow',
    expectedVersion: cycleOverrideTarget.recordVersion,
    expiresAt: null,
    permission: 'recruitment.application.read',
    reason: '真实届次权限覆盖验证',
    recruitmentCycleId: realRecruitmentCycle.id,
    scopeType: 'recruitmentCycle',
  },
  { now: new Date(), requestId: `identity-cycle-set-${runId}` },
)
const cycleDocument = await readOverride(cycleOverride.overrideId)
assert(
  cycleOverride.accountVersion === cycleOverrideTarget.recordVersion + 1 &&
    cycleDocument.scopeType === 'recruitmentCycle' &&
    (typeof cycleDocument.recruitmentCycle === 'string'
      ? cycleDocument.recruitmentCycle
      : cycleDocument.recruitmentCycle?.id) === realRecruitmentCycle.id &&
    (await activeOverrideCount(cycleOverrideTarget.id)) === 1 &&
    (await auditCount(cycleOverrideTarget.id)) === cycleSetAuditBefore + 1,
  'Real recruitment cycle override set did not persist atomically',
)
const cycleRevokeBefore = await readUser(cycleOverrideTarget.id)
const cycleRevokeAuditBefore = await auditCount(cycleOverrideTarget.id)
await revokePermissionOverride(
  payload,
  ownerReq,
  cycleOverrideTarget.id,
  cycleOverride.overrideId,
  {
    expectedVersion: cycleRevokeBefore.recordVersion,
    reason: '真实届次权限撤销验证',
  },
  { now: new Date(), requestId: `identity-cycle-revoke-${runId}` },
)
assert(
  Boolean((await readOverride(cycleOverride.overrideId)).revokedAt) &&
    (await readUser(cycleOverrideTarget.id)).recordVersion ===
      cycleRevokeBefore.recordVersion + 1 &&
    (await activeOverrideCount(cycleOverrideTarget.id)) === 0 &&
    (await auditCount(cycleOverrideTarget.id)) === cycleRevokeAuditBefore + 1,
  'Real recruitment cycle override revoke did not persist atomically',
)

const globalDuplicateTarget = await createFixtureUser(
  'override-global-duplicate',
  'staff',
)
await setPermissionOverride(
  payload,
  ownerReq,
  globalDuplicateTarget.id,
  {
    effect: 'allow',
    expectedVersion: globalDuplicateTarget.recordVersion,
    expiresAt: null,
    permission: 'audit.read',
    reason: 'global 活动重复准备',
    recruitmentCycleId: null,
    scopeType: 'global',
  },
  { now: new Date(), requestId: `identity-global-duplicate-seed-${runId}` },
)
const globalDuplicateAccountBefore = stateSnapshot(
  await readUser(globalDuplicateTarget.id),
)
const globalDuplicateOverridesBefore = await overrideRowsSnapshot(
  globalDuplicateTarget.id,
)
const globalDuplicateAuditBefore = await auditCount(globalDuplicateTarget.id)
const globalDuplicateError = await expectBusinessError(
  () =>
    setPermissionOverride(
      payload,
      ownerReq,
      globalDuplicateTarget.id,
      {
        effect: 'deny',
        expectedVersion: globalDuplicateAccountBefore.recordVersion,
        expiresAt: null,
        permission: 'audit.read',
        reason: 'global 活动重复约束验证',
        recruitmentCycleId: null,
        scopeType: 'global',
      },
      { now: new Date(), requestId: `identity-global-duplicate-${runId}` },
    ),
  409,
  'Global active override duplicate',
)
assert(
  globalDuplicateError.code === 'CONFLICT' &&
    JSON.stringify(stateSnapshot(await readUser(globalDuplicateTarget.id))) ===
      JSON.stringify(globalDuplicateAccountBefore) &&
    (await overrideRowsSnapshot(globalDuplicateTarget.id)) ===
      globalDuplicateOverridesBefore &&
    (await auditCount(globalDuplicateTarget.id)) === globalDuplicateAuditBefore,
  'Global active duplicate did not map exact conflict with zero changes',
)

const cycleDuplicateTarget = await createFixtureUser(
  'override-cycle-duplicate',
  'staff',
)
await setPermissionOverride(
  payload,
  ownerReq,
  cycleDuplicateTarget.id,
  {
    effect: 'allow',
    expectedVersion: cycleDuplicateTarget.recordVersion,
    expiresAt: null,
    permission: 'recruitment.application.read',
    reason: 'cycle 活动重复准备',
    recruitmentCycleId: realRecruitmentCycle.id,
    scopeType: 'recruitmentCycle',
  },
  { now: new Date(), requestId: `identity-cycle-duplicate-seed-${runId}` },
)
const cycleDuplicateAccountBefore = stateSnapshot(
  await readUser(cycleDuplicateTarget.id),
)
const cycleDuplicateOverridesBefore = await overrideRowsSnapshot(
  cycleDuplicateTarget.id,
)
const cycleDuplicateAuditBefore = await auditCount(cycleDuplicateTarget.id)
const cycleDuplicateError = await expectBusinessError(
  () =>
    setPermissionOverride(
      payload,
      ownerReq,
      cycleDuplicateTarget.id,
      {
        effect: 'deny',
        expectedVersion: cycleDuplicateAccountBefore.recordVersion,
        expiresAt: null,
        permission: 'recruitment.application.read',
        reason: 'cycle 活动重复约束验证',
        recruitmentCycleId: realRecruitmentCycle.id,
        scopeType: 'recruitmentCycle',
      },
      { now: new Date(), requestId: `identity-cycle-duplicate-${runId}` },
    ),
  409,
  'Cycle active override duplicate',
)
assert(
  cycleDuplicateError.code === 'CONFLICT' &&
    JSON.stringify(stateSnapshot(await readUser(cycleDuplicateTarget.id))) ===
      JSON.stringify(cycleDuplicateAccountBefore) &&
    (await overrideRowsSnapshot(cycleDuplicateTarget.id)) ===
      cycleDuplicateOverridesBefore &&
    (await auditCount(cycleDuplicateTarget.id)) === cycleDuplicateAuditBefore,
  'Cycle active duplicate did not map exact conflict with zero changes',
)

const setRollbackTarget = await createFixtureUser(
  'override-set-rollback',
  'staff',
)
const setRollbackBefore = await readUser(setRollbackTarget.id)
const setRollbackAuditBefore = await auditCount(setRollbackTarget.id)
const setRollbackRequestId = `identity-override-set-rollback-${runId}`
payload.create = (async (options) => {
  const data = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    data.requestId === setRollbackRequestId
  ) {
    throw new Error('intentional override set audit failure')
  }
  return originalCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await setPermissionOverride(
    payload,
    ownerReq,
    setRollbackTarget.id,
    {
      effect: 'deny',
      expectedVersion: setRollbackBefore.recordVersion,
      expiresAt: null,
      permission: 'content.edit',
      reason: '权限设置审计回滚验证',
      recruitmentCycleId: null,
      scopeType: 'global',
    },
    { now: new Date(), requestId: setRollbackRequestId },
  )
  throw new Error('Override set unexpectedly survived audit failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional override set audit failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalCreate
}
assert(
  (await readUser(setRollbackTarget.id)).recordVersion ===
    setRollbackBefore.recordVersion &&
    (await activeOverrideCount(setRollbackTarget.id)) === 0 &&
    (await auditCount(setRollbackTarget.id)) === setRollbackAuditBefore,
  'Override set audit failure left account, override, or audit changes',
)

const revokeRollbackTarget = await createFixtureUser(
  'override-revoke-rollback',
  'staff',
)
const revokeRollbackSeed = await setPermissionOverride(
  payload,
  ownerReq,
  revokeRollbackTarget.id,
  {
    effect: 'deny',
    expectedVersion: revokeRollbackTarget.recordVersion,
    expiresAt: null,
    permission: 'content.create',
    reason: '权限撤销回滚准备',
    recruitmentCycleId: null,
    scopeType: 'global',
  },
  { now: new Date(), requestId: `identity-revoke-seed-${runId}` },
)
const revokeRollbackBefore = await readUser(revokeRollbackTarget.id)
const revokeDocumentBefore = JSON.stringify(
  await readOverride(revokeRollbackSeed.overrideId),
)
const revokeRollbackAuditBefore = await auditCount(revokeRollbackTarget.id)
const revokeRollbackRequestId = `identity-override-revoke-rollback-${runId}`
payload.create = (async (options) => {
  const data = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    data.requestId === revokeRollbackRequestId
  ) {
    throw new Error('intentional override revoke audit failure')
  }
  return originalCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await revokePermissionOverride(
    payload,
    ownerReq,
    revokeRollbackTarget.id,
    revokeRollbackSeed.overrideId,
    {
      expectedVersion: revokeRollbackBefore.recordVersion,
      reason: '权限撤销审计回滚验证',
    },
    { now: new Date(), requestId: revokeRollbackRequestId },
  )
  throw new Error('Override revoke unexpectedly survived audit failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional override revoke audit failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalCreate
}
assert(
  (await readUser(revokeRollbackTarget.id)).recordVersion ===
    revokeRollbackBefore.recordVersion &&
    JSON.stringify(await readOverride(revokeRollbackSeed.overrideId)) ===
      revokeDocumentBefore &&
    (await activeOverrideCount(revokeRollbackTarget.id)) === 1 &&
    (await auditCount(revokeRollbackTarget.id)) === revokeRollbackAuditBefore,
  'Override revoke audit failure changed account, history, or audit',
)

const concurrentOverrideTarget = await createFixtureUser(
  'override-concurrent',
  'staff',
)
const concurrentOverrideAuditBefore = await auditCount(
  concurrentOverrideTarget.id,
)
const concurrentManagerReqs = await Promise.all([
  requestForToken(ownerLogin.token, `identity-override-concurrent-a-${runId}`),
  requestForToken(ownerLogin.token, `identity-override-concurrent-b-${runId}`),
])
const concurrentOverrideResults = await Promise.allSettled(
  concurrentManagerReqs.map((managerReq, index) =>
    setPermissionOverride(
      payload,
      managerReq,
      concurrentOverrideTarget.id,
      {
        effect: 'allow',
        expectedVersion: concurrentOverrideTarget.recordVersion,
        expiresAt: null,
        permission: 'content.edit',
        reason: `并发权限覆盖验证 ${index + 1}`,
        recruitmentCycleId: null,
        scopeType: 'global',
      },
      {
        now: new Date(),
        requestId: `identity-override-concurrent-${index + 1}-${runId}`,
      },
    ),
  ),
)
const concurrentSuccesses = concurrentOverrideResults.filter(
  (result) => result.status === 'fulfilled',
)
const concurrentStaleVersionConflicts = concurrentOverrideResults.filter(
  (result) =>
    result.status === 'rejected' &&
    result.reason instanceof BusinessError &&
    result.reason.status === 409,
)
assert(
  concurrentSuccesses.length === 1 &&
    concurrentStaleVersionConflicts.length === 1 &&
    (await activeOverrideCount(concurrentOverrideTarget.id)) === 1 &&
    (await readUser(concurrentOverrideTarget.id)).recordVersion === 2 &&
    (await auditCount(concurrentOverrideTarget.id)) ===
      concurrentOverrideAuditBefore + 1,
  'Serialized concurrent override set did not converge through one stale-version conflict',
)

const raceDisable = await createFixtureUser('race-disable', 'staff')
await assertConcurrentTerminalState({
  action: 'disable',
  managerReq: ownerReq,
  password: fixturePassword,
  user: raceDisable,
})
const raceReset = await createFixtureUser('race-reset', 'staff')
await assertConcurrentTerminalState({
  action: 'reset',
  managerReq: ownerReq,
  password: fixturePassword,
  user: raceReset,
})

const activationDisableRace = await createAccount(
  payload,
  ownerReq,
  {
    accountType: 'external',
    displayName: '虚构激活停用竞争账号',
    loginName: fixtureUsername('activation-race'),
    reason: '激活与停用竞争探针',
    role: 'staff',
    studentNumber: null,
  },
  { now: new Date(), requestId: `identity-activation-race-create-${runId}` },
)
const activationDisableBefore = await readUser(activationDisableRace.account.id)
const activationDisableResults = await Promise.allSettled([
  activateAccount(
    payload,
    await createLocalReq({ req: { headers: new Headers() } }, payload),
    activationSchema.parse({
      loginName: activationDisableRace.account.loginName,
      newPassword: 'Activation-Race-Formal-2026!',
      newPasswordConfirmation: 'Activation-Race-Formal-2026!',
      temporaryCredential: activationDisableRace.temporaryCredential,
    }),
    { now: new Date(), requestId: `identity-activation-race-${runId}` },
  ),
  changeAccountState(
    payload,
    ownerReq,
    activationDisableBefore.id,
    'disable',
    {
      expectedVersion: activationDisableBefore.recordVersion,
      reason: '激活竞争期间停用',
    },
    { now: new Date(), requestId: `identity-disable-race-${runId}` },
  ),
])
const activationDisableAfter = await readUser(activationDisableBefore.id)
const activationWon = activationDisableResults[0]?.status === 'fulfilled'
const disableWon = activationDisableResults[1]?.status === 'fulfilled'
assert(
  Number(activationWon) + Number(disableWon) === 1,
  'Activation-versus-disable race did not serialize to one successful state transition',
)
assert(
  activationDisableAfter.status === (activationWon ? 'active' : 'disabled'),
  'Activation-versus-disable race ended in a state inconsistent with its winner',
)
assert(
  (activationDisableAfter.sessions ?? []).length === 0,
  'Activation-versus-disable race left a session',
)

const activationResetRace = await createFixtureUser(
  'activation-reset-race',
  'staff',
)
const activationResetBefore = await readUser(activationResetRace.id)
const activationResetResults = await Promise.allSettled([
  activateAccount(
    payload,
    await createLocalReq({ req: { headers: new Headers() } }, payload),
    activationSchema.parse({
      loginName: activationResetBefore.username,
      newPassword: 'Activation-Reset-Race-2026!',
      newPasswordConfirmation: 'Activation-Reset-Race-2026!',
      temporaryCredential: fixturePassword,
    }),
    { now: new Date(), requestId: `identity-activation-reset-${runId}` },
  ),
  changeAccountState(
    payload,
    ownerReq,
    activationResetBefore.id,
    'reset',
    {
      expectedVersion: activationResetBefore.recordVersion,
      reason: '激活竞争期间重置',
    },
    { now: new Date(), requestId: `identity-reset-race-${runId}` },
  ),
])
assert(
  activationResetResults[0]?.status === 'rejected' &&
    activationResetResults[1]?.status === 'fulfilled',
  'Active activation-versus-reset race did not reject activation and complete reset',
)
const activationResetAfter = await readUser(activationResetBefore.id)
assert(
  activationResetAfter.status === 'pendingActivation',
  'Active activation-versus-reset race did not end pending activation',
)
assert(
  (activationResetAfter.sessions ?? []).length === 0,
  'Active activation-versus-reset race left a session',
)

const auditSecrets = [
  fixturePassword,
  created.temporaryCredential,
  password12,
  password128,
  resetPassword,
  resetCredential,
  reenableCredential,
  activationDisableRace.temporaryCredential,
  firstLogin.token ?? '',
  secondLogin.token ?? '',
  afterSelfLogin.token ?? '',
  beforeRollbackLogin.token ?? '',
  beforeSelfChange.hash ?? '',
  beforeSelfChange.salt ?? '',
  ...observedSessionIds,
  ...collectStrings((await readUser(created.account.id)).sessions).filter(
    (value) => value.length > 8,
  ),
]
await assertAuditHasNoSecrets(
  [
    created.account.id,
    adminTarget.id,
    raceDisable.id,
    raceReset.id,
    activationDisableRace.account.id,
    activationResetRace.id,
  ],
  auditSecrets,
)

console.log(
  `Identity access passed: lifecycle, password boundaries, Session revocation, rollback, concurrency, authorization and Secret assertions (${runId})`,
)

process.exit(0)
