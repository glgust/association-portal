import 'dotenv/config'

import type { PublicActivityListItem } from '@ascnucc/contracts'
import { sql } from '@payloadcms/db-postgres'
import { randomUUID } from 'node:crypto'
import {
  createLocalReq,
  Forbidden,
  getPayload,
  type TypedUser,
  ValidationError,
} from 'payload'

import config from '../src/payload.config'
import type { Activity, AuthUser } from '../src/payload-types'
import { compareActivityCatalogItems } from '../src/modules/content/activities/domain'
import {
  getPublicActivity,
  listPublicActivities,
} from '../src/modules/content/activities/public-read'
import { BusinessError } from '../src/modules/shared/business-error'
import { GET as listActivitiesRoute } from '../src/app/api/v1/content/activities/route'
import { GET as getActivityRoute } from '../src/app/api/v1/content/activities/[slug]/route'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Activity integration test may only use local ascnucc_demo_test',
  )
}

const payload = await getPayload({ config })
const runId = randomUUID()
const usernameEntropy = runId.replaceAll('-', '').slice(0, 20)
const fixtureUsernames = new Set<string>()
let fixtureUsernameSequence = 0

function fixtureUsername(scenario: string): string {
  fixtureUsernameSequence += 1
  const scenarioPrefix = scenario.replaceAll(/[^a-z0-9]/g, '').slice(0, 6)
  const username = `a${fixtureUsernameSequence}-${scenarioPrefix}-${usernameEntropy}`
  if (
    username.length > 32 ||
    !/^[a-z][a-z0-9._-]{2,31}$/.test(username) ||
    fixtureUsernames.has(username)
  ) {
    throw new Error('Activity fixture username invariant failed')
  }
  fixtureUsernames.add(username)
  return username
}

function body(text: string): Activity['body'] {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal' as const,
              style: '',
              text,
              type: 'text' as const,
              version: 1,
            },
          ],
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph' as const,
          version: 1,
        },
      ],
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      type: 'root' as const,
      version: 1,
    },
  }
}

async function ensureUser(
  suffix: string,
  role: AuthUser['role'] = 'staff',
  accessExpiresAt?: string,
) {
  return payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'external',
      accessExpiresAt,
      displayName: `虚构活动测试账号 ${suffix}`,
      password: 'Local-activity-Only-2026!',
      recordVersion: 1,
      role,
      status: 'active',
      username: fixtureUsername(suffix),
    },
    overrideAccess: true,
  })
}

function typedUser(user: Awaited<ReturnType<typeof ensureUser>>): TypedUser {
  return { ...user, collection: 'auth-users' } as TypedUser
}

async function requestFor(
  user?: Awaited<ReturnType<typeof ensureUser>>,
  options: { draft?: boolean; requestId?: string } = {},
) {
  const req = await createLocalReq(
    {
      req: {
        headers: new Headers({
          'x-request-id': options.requestId ?? `activity-${runId}`,
        }),
      },
      user: user ? typedUser(user) : undefined,
    },
    payload,
  )
  req.query = options.draft ? { draft: true } : {}
  return req
}

function temporaryData(title: string) {
  return {
    activityType: 'temporary' as const,
    body: body(`${title}的虚构正文`),
    cancellationNote: null,
    endsAt: '2026-07-20T22:00:00+08:00',
    isCancelled: false,
    location: '虚构校园北广场',
    scheduleText: null,
    startsAt: '2026-07-20T20:00:00+08:00',
    summary: '纯虚构活动摘要',
    title,
  }
}

function standingData(title: string) {
  return {
    activityType: 'standing' as const,
    body: body(`${title}的虚构正文`),
    cancellationNote: null,
    endsAt: null,
    isCancelled: false,
    location: '虚构社团活动室',
    scheduleText: '每周五 19:30–21:00',
    startsAt: null,
    summary: null,
    title,
  }
}

async function createDraft(
  user: Awaited<ReturnType<typeof ensureUser>>,
  data: ReturnType<typeof standingData> | ReturnType<typeof temporaryData>,
) {
  return payload.create({
    collection: 'activities',
    data,
    draft: true,
    overrideAccess: false,
    req: await requestFor(user, { draft: true }),
  })
}

async function publish(
  user: Awaited<ReturnType<typeof ensureUser>>,
  activity: Activity,
  requestId = `publish-${runId}`,
) {
  return payload.update({
    collection: 'activities',
    id: activity.id,
    data: { ...activity, _status: 'published' },
    overrideAccess: false,
    req: await requestFor(user, { requestId }),
  })
}

async function expectPublicNotFound(slug: string): Promise<void> {
  try {
    await getPublicActivity(payload, await requestFor(), slug)
  } catch (error) {
    if (error instanceof BusinessError && error.code === 'NOT_FOUND') return
    throw error
  }
  throw new Error(`Activity ${slug} unexpectedly remained public`)
}

async function snapshotFor(id: string) {
  const [activity, versions, audits] = await Promise.all([
    payload.findByID({
      collection: 'activities',
      depth: 0,
      id,
      overrideAccess: true,
    }),
    payload.findVersions({
      collection: 'activities',
      depth: 0,
      limit: 50,
      overrideAccess: true,
      sort: 'id',
      where: { parent: { equals: id } },
    }),
    payload.find({
      collection: 'audit-events',
      depth: 0,
      limit: 50,
      overrideAccess: true,
      sort: 'id',
      where: { targetId: { equals: id } },
    }),
  ])
  return { activity, audits: audits.docs, versions: versions.docs }
}

async function assertRejectedWithoutChange(
  activity: Activity,
  operation: () => Promise<unknown>,
  expected: 'forbidden' | 'validation',
): Promise<void> {
  const before = await snapshotFor(activity.id)
  try {
    await operation()
    throw new Error(`Expected ${expected} activity operation to fail`)
  } catch (error) {
    if (expected === 'forbidden' && !(error instanceof Forbidden)) throw error
    if (expected === 'validation' && !(error instanceof ValidationError))
      throw error
  }
  const after = await snapshotFor(activity.id)
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      `${expected} activity operation changed data, versions, or audit`,
    )
  }
}

const editor = await ensureUser('editor')
const temporaryDraft = await createDraft(
  editor,
  temporaryData(`虚构临时活动 ${runId}`),
)
const standingDraft = await createDraft(
  editor,
  standingData(`虚构常驻活动 ${runId}`),
)
if (
  temporaryDraft._status !== 'draft' ||
  standingDraft._status !== 'draft' ||
  !temporaryDraft.slug ||
  !standingDraft.slug
) {
  throw new Error(
    'Activity drafts did not receive draft status and server slugs',
  )
}
await expectPublicNotFound(temporaryDraft.slug)
await expectPublicNotFound(standingDraft.slug)

const initialTemporary = await publish(editor, temporaryDraft)
const initialStanding = await publish(editor, standingDraft)
if (!initialTemporary.publishedAt || !initialStanding.publishedAt) {
  throw new Error('Activity publish did not set publishedAt')
}

const firstPublic = await getPublicActivity(
  payload,
  await requestFor(),
  temporaryDraft.slug,
  new Date('2026-07-20T11:00:00.000Z'),
)
if (firstPublic.status !== 'upcoming') {
  throw new Error('Temporary public activity state was not projected by CMS')
}

await payload.update({
  collection: 'activities',
  id: temporaryDraft.id,
  data: {
    _status: 'draft',
    cancellationNote: '虚构天气原因，活动取消。',
    isCancelled: true,
    title: `${temporaryDraft.title}（取消版草稿）`,
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const publicBeforeCancellation = await getPublicActivity(
  payload,
  await requestFor(),
  temporaryDraft.slug,
  new Date('2026-07-20T11:00:00.000Z'),
)
if (
  publicBeforeCancellation.status !== 'upcoming' ||
  publicBeforeCancellation.title !== temporaryDraft.title
) {
  throw new Error('Cancellation draft changed the current public activity')
}

const cancellationDraft = await payload.findByID({
  collection: 'activities',
  id: temporaryDraft.id,
  draft: true,
  overrideAccess: true,
})
const cancelled = await publish(
  editor,
  cancellationDraft,
  `publish-cancellation-${runId}`,
)
const publicCancelled = await getPublicActivity(
  payload,
  await requestFor(),
  temporaryDraft.slug,
  new Date('2026-07-20T11:00:00.000Z'),
)
if (
  publicCancelled.status !== 'cancelled' ||
  publicCancelled.cancellationNote !== '虚构天气原因，活动取消。' ||
  cancelled.publishedAt === initialTemporary.publishedAt
) {
  throw new Error('Publishing cancellation did not replace the public version')
}

const switchingDraft = await createDraft(
  editor,
  temporaryData(`字段切换活动 ${runId}`),
)
await publish(editor, switchingDraft, `publish-switch-initial-${runId}`)
await payload.update({
  collection: 'activities',
  id: switchingDraft.id,
  data: {
    _status: 'draft',
    activityType: 'standing',
    scheduleText: '  周五开放\r\n周六开放\r周日开放  ',
    summary: '  摘要第一行\r\n摘要第二行  ',
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const standingSwitchDraft = await payload.findByID({
  collection: 'activities',
  draft: true,
  id: switchingDraft.id,
  overrideAccess: true,
})
if (
  standingSwitchDraft.startsAt !== null ||
  standingSwitchDraft.endsAt !== null
) {
  throw new Error('Temporary to standing draft retained inactive dates')
}
const switchedStanding = await publish(
  editor,
  standingSwitchDraft,
  `publish-switch-standing-${runId}`,
)
if (
  switchedStanding.scheduleText !== '周五开放\n周六开放\n周日开放' ||
  switchedStanding.summary !== '摘要第一行\n摘要第二行' ||
  switchedStanding.historySortAt !== switchedStanding.publishedAt
) {
  throw new Error('Standing publication did not canonicalize multiline text')
}

await payload.update({
  collection: 'activities',
  id: switchingDraft.id,
  data: {
    _status: 'draft',
    activityType: 'temporary',
    cancellationNote: '  取消第一行\r\n取消第二行  ',
    endsAt: '2026-07-20T22:00:00+08:00',
    isCancelled: true,
    startsAt: '2026-07-20T20:00:00+08:00',
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const temporarySwitchDraft = await payload.findByID({
  collection: 'activities',
  draft: true,
  id: switchingDraft.id,
  overrideAccess: true,
})
if (temporarySwitchDraft.scheduleText !== null) {
  throw new Error('Standing to temporary draft retained inactive schedule')
}
const switchedTemporary = await publish(
  editor,
  temporarySwitchDraft,
  `publish-switch-temporary-${runId}`,
)
const switchedTemporaryPublic = await getPublicActivity(
  payload,
  await requestFor(),
  switchedTemporary.slug,
  new Date('2026-07-20T13:00:00.000Z'),
)
if (
  switchedTemporary.historySortAt !== switchedTemporary.endsAt ||
  switchedTemporaryPublic.status !== 'cancelled' ||
  switchedTemporaryPublic.cancellationNote !== '取消第一行\n取消第二行'
) {
  throw new Error('Temporary publication retained stale or noncanonical fields')
}

await payload.update({
  collection: 'activities',
  id: switchingDraft.id,
  data: { _status: 'draft', isCancelled: false },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const restoredSwitchDraft = await payload.findByID({
  collection: 'activities',
  draft: true,
  id: switchingDraft.id,
  overrideAccess: true,
})
if (restoredSwitchDraft.cancellationNote !== null) {
  throw new Error('Restored draft retained inactive cancellation note')
}
const restoredSwitch = await publish(
  editor,
  restoredSwitchDraft,
  `publish-switch-restored-${runId}`,
)
if (restoredSwitch.cancellationNote !== null) {
  throw new Error('Restored publication retained inactive cancellation note')
}

await assertRejectedWithoutChange(
  temporaryDraft,
  async () =>
    payload.update({
      collection: 'activities',
      id: temporaryDraft.id,
      data: { slug: `tampered-${runId}` },
      draft: true,
      overrideAccess: false,
      req: await requestFor(editor, { draft: true }),
    }),
  'validation',
)

const incomplete = await payload.create({
  collection: 'activities',
  data: {
    ...temporaryData(`不完整活动 ${runId}`),
    endsAt: null,
    location: '',
    startsAt: null,
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
await assertRejectedWithoutChange(
  incomplete,
  async () => publish(editor, incomplete),
  'validation',
)
await assertRejectedWithoutChange(
  incomplete,
  async () =>
    payload.update({
      collection: 'activities',
      id: incomplete.id,
      data: { _status: 'draft' },
      overrideAccess: false,
      req: await requestFor(editor, { requestId: `never-unpublish-${runId}` }),
    }),
  'validation',
)

const rollbackDraft = await createDraft(
  editor,
  standingData(`审计回滚活动 ${runId}`),
)
const publishFailureRequestId = `activity-audit-publish-failure-${runId}`
const originalPayloadCreate = payload.create
const rollbackBefore = await snapshotFor(rollbackDraft.id)
payload.create = (async (options) => {
  const data = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    data.requestId === publishFailureRequestId
  ) {
    throw new Error('intentional activity audit failure')
  }
  return originalPayloadCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await publish(editor, rollbackDraft, publishFailureRequestId)
  throw new Error('Publish unexpectedly survived an audit failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional activity audit failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalPayloadCreate
}
const rollbackAfter = await snapshotFor(rollbackDraft.id)
if (JSON.stringify(rollbackAfter) !== JSON.stringify(rollbackBefore)) {
  throw new Error(
    'Audit failure did not roll back activity publication, versions, and audit',
  )
}

const unpublishFailureRequestId = `activity-audit-unpublish-failure-${runId}`
const standingBeforeFailure = await snapshotFor(standingDraft.id)
payload.create = (async (options) => {
  const data = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    data.requestId === unpublishFailureRequestId
  ) {
    throw new Error('intentional activity unpublish audit failure')
  }
  return originalPayloadCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await payload.update({
    collection: 'activities',
    id: standingDraft.id,
    data: { _status: 'draft' },
    overrideAccess: false,
    req: await requestFor(editor, { requestId: unpublishFailureRequestId }),
  })
  throw new Error('Unpublish unexpectedly survived an audit failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional activity unpublish audit failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalPayloadCreate
}
const standingAfterFailure = await snapshotFor(standingDraft.id)
if (
  JSON.stringify(standingAfterFailure) !== JSON.stringify(standingBeforeFailure)
) {
  throw new Error('Audit failure did not roll back activity unpublish')
}

for (const role of ['staff', 'cadre', 'admin', 'owner'] as const) {
  const user = await ensureUser(`role-${role}`, role)
  const draft = await createDraft(
    user,
    standingData(`角色 ${role} 活动 ${runId}`),
  )
  const result = await publish(user, draft, `role-${role}-${runId}`)
  if (result._status !== 'published') {
    throw new Error(
      `Role ${role} did not retain the frozen content permissions`,
    )
  }
}

const denied = await ensureUser('denied')
const overrideGrantor = await ensureUser('override-grantor', 'admin')
await payload.create({
  collection: 'permission-overrides',
  data: {
    effect: 'deny',
    grantedAt: '2026-07-13T00:00:00.000Z',
    grantedBy: overrideGrantor.id,
    permission: 'content.directPublish',
    reason: '虚构活动集成测试显式拒绝',
    scopeType: 'global',
    user: denied.id,
  },
  overrideAccess: true,
})
const deniedDraft = await createDraft(denied, standingData(`显式拒绝 ${runId}`))
await assertRejectedWithoutChange(
  deniedDraft,
  async () => publish(denied, deniedDraft),
  'forbidden',
)
await assertRejectedWithoutChange(
  standingDraft,
  async () =>
    payload.update({
      collection: 'activities',
      id: standingDraft.id,
      data: { _status: 'draft' },
      overrideAccess: false,
      req: await requestFor(denied, { requestId: `denied-unpublish-${runId}` }),
    }),
  'forbidden',
)

const expired = await ensureUser(
  'expired-account',
  'staff',
  '2020-01-01T00:00:00.000Z',
)
await assertRejectedWithoutChange(
  standingDraft,
  async () =>
    payload.update({
      collection: 'activities',
      id: standingDraft.id,
      data: { title: `过期账号修改 ${runId}` },
      overrideAccess: false,
      req: await requestFor(expired),
    }),
  'forbidden',
)

const expiredDeny = await ensureUser('expired-deny')
await payload.create({
  collection: 'permission-overrides',
  data: {
    effect: 'deny',
    expiresAt: '2020-01-01T00:00:00.000Z',
    grantedAt: '2026-07-13T00:00:00.000Z',
    grantedBy: overrideGrantor.id,
    permission: 'content.directPublish',
    reason: '虚构活动集成测试过期拒绝',
    scopeType: 'global',
    user: expiredDeny.id,
  },
  overrideAccess: true,
})
const expiredDenyDraft = await createDraft(
  expiredDeny,
  standingData(`过期 deny ${runId}`),
)
await publish(expiredDeny, expiredDenyDraft)

const invalidScope = await ensureUser('invalid-scope')
const cycle = await payload.create({
  collection: 'recruitment-cycles',
  data: {
    code: `activity-${runId}`,
    name: '虚构活动测试届次',
    status: 'draft',
  },
  overrideAccess: true,
})
const invalidOverrideCountBefore = await payload.count({
  collection: 'permission-overrides',
  overrideAccess: true,
})
try {
  await payload.create({
    collection: 'permission-overrides',
    data: {
      effect: 'deny',
      grantedAt: '2026-07-13T00:00:00.000Z',
      grantedBy: overrideGrantor.id,
      permission: 'content.directPublish',
      reason: '虚构活动集成测试届次范围拒绝',
      recruitmentCycle: cycle.id,
      scopeType: 'recruitmentCycle',
      user: invalidScope.id,
    },
    overrideAccess: true,
  })
  throw new Error(
    'Malformed activity override unexpectedly passed Collection validation',
  )
} catch (error) {
  if (
    !(error instanceof BusinessError) ||
    error.code !== 'VALIDATION_FAILED' ||
    error.status !== 400
  ) {
    throw error
  }
}
const invalidOverrideCountAfter = await payload.count({
  collection: 'permission-overrides',
  overrideAccess: true,
})
if (
  invalidOverrideCountAfter.totalDocs !== invalidOverrideCountBefore.totalDocs
) {
  throw new Error('Rejected activity override changed PermissionOverride data')
}

const { rows: invalidScopeRows } = await payload.db.drizzle.execute(sql`
  INSERT INTO "permission_overrides" (
    "user_id", "permission", "effect", "scope_type",
    "recruitment_cycle_id", "reason", "granted_by_id", "granted_at"
  ) VALUES (
    ${invalidScope.id}, 'content.directPublish', 'deny', 'recruitmentCycle',
    ${cycle.id}, '虚构活动集成测试届次范围拒绝', ${overrideGrantor.id},
    '2026-07-13T00:00:00.000Z'
  )
  RETURNING "id"
`)
const invalidScopeOverrideId = (
  invalidScopeRows[0] as { id?: string } | undefined
)?.id
if (!invalidScopeOverrideId || invalidScopeRows.length !== 1) {
  throw new Error('Malformed activity override SQL fixture was not identified')
}
try {
  const invalidScopeTarget = await createDraft(
    editor,
    standingData(`非法 Scope ${runId}`),
  )
  await assertRejectedWithoutChange(
    invalidScopeTarget,
    async () => publish(invalidScope, invalidScopeTarget),
    'forbidden',
  )
} finally {
  await payload.db.drizzle.execute(sql`
    DELETE FROM "permission_overrides" WHERE "id" = ${invalidScopeOverrideId}
  `)
  const { rows: remainingInvalidScopeRows } = await payload.db.drizzle.execute(
    sql`
      SELECT "id" FROM "permission_overrides"
      WHERE "id" = ${invalidScopeOverrideId}
    `,
  )
  if (remainingInvalidScopeRows.length !== 0) {
    throw new Error('Malformed activity override SQL fixture was not deleted')
  }
}

const beforeAnonymous = await payload.count({
  collection: 'activities',
  overrideAccess: true,
})
try {
  await payload.create({
    collection: 'activities',
    data: standingData(`匿名越权 ${runId}`),
    draft: true,
    overrideAccess: false,
    req: await requestFor(undefined, { draft: true }),
  })
  throw new Error('Anonymous activity create unexpectedly succeeded')
} catch (error) {
  if (!(error instanceof Forbidden)) throw error
}
const afterAnonymous = await payload.count({
  collection: 'activities',
  overrideAccess: true,
})
if (afterAnonymous.totalDocs !== beforeAnonymous.totalDocs) {
  throw new Error('Anonymous activity create changed the database')
}

const drizzle = payload.db.drizzle
const fixtureBody = JSON.stringify(body('虚构深分页活动正文'))
const { rows: ongoingFixtureRows } = await drizzle.execute(sql`
  INSERT INTO "activities" (
    "id", "activity_type", "title", "summary", "slug", "location",
    "starts_at", "ends_at", "is_cancelled", "body", "published_at",
    "history_sort_at", "created_by_id", "last_edited_by_id", "_status"
  )
  SELECT
    gen_random_uuid(), 'temporary', format('虚构深分页活动 %s', fixture_number),
    '虚构深分页摘要', format('deep-page-%s-%s', ${runId}::text, fixture_number),
    '虚构校园南广场', '2026-07-20T12:00:00.000Z',
    ('2026-07-20T14:00:00.000Z'::timestamptz + fixture_number * interval '1 second'),
    false, ${fixtureBody}::jsonb, '2026-07-18T08:00:00.000Z',
    ('2026-07-20T14:00:00.000Z'::timestamptz + fixture_number * interval '1 second'),
    ${editor.id}, ${editor.id}, 'published'
  FROM generate_series(1, 55) AS fixtures(fixture_number)
  RETURNING "id"
`)
const { rows: upcomingFixtureRows } = await drizzle.execute(sql`
  INSERT INTO "activities" (
    "id", "activity_type", "title", "slug", "location", "starts_at",
    "ends_at", "is_cancelled", "body", "published_at", "history_sort_at",
    "created_by_id", "last_edited_by_id", "_status"
  )
  SELECT
    gen_random_uuid(), 'temporary', format('虚构未来活动 %s', fixture_number),
    format('upcoming-%s-%s', ${runId}::text, fixture_number), '虚构未来地点',
    ('2026-07-21T12:00:00.000Z'::timestamptz + fixture_number * interval '1 hour'),
    ('2026-07-21T14:00:00.000Z'::timestamptz + fixture_number * interval '1 hour'),
    false, ${fixtureBody}::jsonb, '2026-07-18T08:00:00.000Z',
    ('2026-07-21T14:00:00.000Z'::timestamptz + fixture_number * interval '1 hour'),
    ${editor.id}, ${editor.id}, 'published'
  FROM generate_series(1, 2) AS fixtures(fixture_number)
  RETURNING "id"
`)
const { rows: standingHistoryRows } = await drizzle.execute(sql`
  INSERT INTO "activities" (
    "id", "activity_type", "title", "slug", "location", "schedule_text",
    "is_cancelled", "cancellation_note", "body", "published_at",
    "history_sort_at", "created_by_id", "last_edited_by_id", "_status"
  ) VALUES (
    gen_random_uuid(), 'standing', '虚构已取消常驻活动',
    ${`cancelled-standing-${runId}`}, '虚构常驻地点', '每周六', true,
    '虚构取消说明', ${fixtureBody}::jsonb, '2026-07-19T08:00:00.000Z',
    '2026-07-19T08:00:00.000Z', ${editor.id}, ${editor.id}, 'published'
  )
  RETURNING "id"
`)
const fixtureIds = new Set(
  [...ongoingFixtureRows, ...upcomingFixtureRows, ...standingHistoryRows].map(
    (row) => (row as { id: string }).id,
  ),
)

const observedActivityFinds: Array<{
  limit?: number
  page?: number
  window: boolean
}> = []
const originalPayloadFind = payload.find
payload.find = (async (options) => {
  if (options.collection === 'activities') {
    const select = options.select as { historySortAt?: boolean } | undefined
    observedActivityFinds.push({
      limit: options.limit,
      page: options.page,
      window: select?.historySortAt === true,
    })
  }
  return originalPayloadFind.call(payload, options as never)
}) as typeof payload.find
try {
  await listPublicActivities(
    payload,
    await requestFor(),
    { page: 12, pageSize: 5 },
    new Date('2026-07-20T13:00:00.000Z'),
  )
} finally {
  payload.find = originalPayloadFind
}
if (
  observedActivityFinds.some(
    ({ limit }) => typeof limit !== 'number' || limit > 50,
  ) ||
  !observedActivityFinds.some(({ page, window }) => window && (page ?? 0) > 1)
) {
  throw new Error('Deep activity pagination used an unbounded database window')
}

const allItems: PublicActivityListItem[] = []
for (let page = 1; ; page += 1) {
  const result = await listPublicActivities(
    payload,
    await requestFor(),
    { page, pageSize: 3 },
    new Date('2026-07-20T13:00:00.000Z'),
  )
  allItems.push(...result.items)
  if (!result.hasNextPage) break
}
if (new Set(allItems.map(({ id }) => id)).size !== allItems.length) {
  throw new Error('Activity pagination produced duplicate rows')
}
if ([...fixtureIds].some((id) => !allItems.some((item) => item.id === id))) {
  throw new Error('Activity pagination omitted a deep-page fixture')
}
const sorted = [...allItems].sort(compareActivityCatalogItems)
if (
  JSON.stringify(sorted.map(({ id }) => id)) !==
  JSON.stringify(allItems.map(({ id }) => id))
) {
  throw new Error(
    'Activity pagination did not preserve the global stable order',
  )
}

await drizzle.execute(sql`
  UPDATE "activities" SET "location" = '' WHERE "id" = ${standingDraft.id}
`)
let malformedLocationError: unknown
try {
  await getPublicActivity(payload, await requestFor(), standingDraft.slug)
} catch (error) {
  malformedLocationError = error
} finally {
  await drizzle.execute(sql`
    UPDATE "activities"
    SET "location" = '虚构社团活动室'
    WHERE "id" = ${standingDraft.id}
  `)
}
if (malformedLocationError === undefined) {
  throw new Error('Malformed published activity unexpectedly mapped publicly')
}
if (malformedLocationError instanceof BusinessError) {
  throw malformedLocationError
}

await drizzle.execute(sql`
  UPDATE "activities"
  SET "starts_at" = NULL
  WHERE "id" = ${temporaryDraft.id}
`)
let malformedTimeError: unknown
let malformedListError: unknown
try {
  await getPublicActivity(payload, await requestFor(), temporaryDraft.slug)
} catch (error) {
  malformedTimeError = error
}
try {
  await listPublicActivities(
    payload,
    await requestFor(),
    { page: 1, pageSize: 10 },
    new Date('2026-07-20T13:00:00.000Z'),
  )
} catch (error) {
  malformedListError = error
}
const listRouteResponse = await listActivitiesRoute(
  new Request('http://127.0.0.1/api/v1/content/activities?page=1&pageSize=10', {
    headers: { 'x-request-id': `malformed-list-${runId}` },
  }),
)
const detailRouteResponse = await getActivityRoute(
  new Request(
    `http://127.0.0.1/api/v1/content/activities/${temporaryDraft.slug}`,
    { headers: { 'x-request-id': `malformed-detail-${runId}` } },
  ),
  { params: Promise.resolve({ slug: temporaryDraft.slug }) },
)
const listRouteBody = await listRouteResponse.json()
const detailRouteBody = await detailRouteResponse.json()
try {
  if (
    listRouteResponse.status !== 500 ||
    detailRouteResponse.status !== 500 ||
    (listRouteBody as { code?: unknown }).code !== 'INTERNAL_ERROR' ||
    (detailRouteBody as { code?: unknown }).code !== 'INTERNAL_ERROR' ||
    /historySortAt|_status|startsAt|root|虚构临时活动/.test(
      JSON.stringify([listRouteBody, detailRouteBody]),
    )
  ) {
    throw new Error('Malformed published activity route did not fail closed')
  }
} finally {
  await drizzle.execute(sql`
    UPDATE "activities"
    SET "starts_at" = '2026-07-20T20:00:00+08:00'
    WHERE "id" = ${temporaryDraft.id}
  `)
}
if (malformedTimeError === undefined || malformedListError === undefined) {
  throw new Error(
    'Published activity with non-ascending times unexpectedly mapped publicly',
  )
}
if (malformedTimeError instanceof BusinessError) throw malformedTimeError

await drizzle.execute(sql`
  UPDATE "activities"
  SET "is_cancelled" = NULL
  WHERE "id" = ${standingDraft.id}
`)
let nullCancellationListError: unknown
let nullCancellationDetailError: unknown
try {
  await listPublicActivities(
    payload,
    await requestFor(),
    { page: 1, pageSize: 10 },
    new Date('2026-07-20T13:00:00.000Z'),
  )
} catch (error) {
  nullCancellationListError = error
}
try {
  await getPublicActivity(payload, await requestFor(), standingDraft.slug)
} catch (error) {
  nullCancellationDetailError = error
} finally {
  await drizzle.execute(sql`
    UPDATE "activities"
    SET "is_cancelled" = false
    WHERE "id" = ${standingDraft.id}
  `)
}
if (
  nullCancellationListError === undefined ||
  nullCancellationDetailError === undefined
) {
  throw new Error('Null published cancellation state did not fail closed')
}

const invalidTypePayload = {
  find: async (options: {
    select?: Record<string, boolean>
    where?: unknown
  }) => {
    if (options.select?.body) {
      return {
        docs: [
          {
            activityType: 'invalid',
            body: body('虚构非法类型正文'),
            cancellationNote: null,
            historySortAt: '2026-07-20T14:00:00+08:00',
            id: temporaryDraft.id,
            isCancelled: false,
            location: '虚构非法类型地点',
            publishedAt: '2026-07-18T08:00:00+08:00',
            slug: 'invalid-type-fixture',
            summary: null,
            title: '虚构非法类型活动',
          },
        ],
        totalDocs: 1,
      }
    }
    return {
      docs: [],
      totalDocs: JSON.stringify(options.where).includes('activityType') ? 0 : 1,
    }
  },
} as unknown as typeof payload
let invalidTypeListError: unknown
let invalidTypeDetailError: unknown
try {
  await listPublicActivities(
    invalidTypePayload,
    await requestFor(),
    { page: 1, pageSize: 10 },
    new Date('2026-07-20T13:00:00.000Z'),
  )
} catch (error) {
  invalidTypeListError = error
}
try {
  await getPublicActivity(
    invalidTypePayload,
    await requestFor(),
    'invalid-type-fixture',
  )
} catch (error) {
  invalidTypeDetailError = error
}
if (
  invalidTypeListError === undefined ||
  invalidTypeDetailError === undefined
) {
  throw new Error('Invalid published activity type did not fail closed')
}

await payload.update({
  collection: 'activities',
  id: temporaryDraft.id,
  data: { _status: 'draft' },
  overrideAccess: false,
  req: await requestFor(editor, { requestId: `unpublish-${runId}` }),
})
await expectPublicNotFound(temporaryDraft.slug)
await assertRejectedWithoutChange(
  temporaryDraft,
  async () =>
    payload.update({
      collection: 'activities',
      id: temporaryDraft.id,
      data: { _status: 'draft' },
      overrideAccess: false,
      req: await requestFor(editor, { requestId: `repeat-unpublish-${runId}` }),
    }),
  'validation',
)

const audits = await payload.find({
  collection: 'audit-events',
  limit: 10,
  overrideAccess: true,
  where: { targetId: { equals: temporaryDraft.id } },
})
if (
  audits.totalDocs !== 3 ||
  audits.docs.some((audit) => {
    const serialized = JSON.stringify(audit)
    return (
      audit.targetType !== 'activity' ||
      audit.result !== 'success' ||
      serialized.includes('虚构校园北广场') ||
      serialized.includes('虚构天气原因') ||
      serialized.includes('虚构正文')
    )
  })
) {
  throw new Error(
    'Activity publication audit trail is incomplete or leaked content',
  )
}

payload.logger.info(
  `Activity publication passed: types, drafts, publish changes, cancellation, unpublish, permissions, rollback, sorting, fail-closed mapping (${runId})`,
)
process.exit(0)
