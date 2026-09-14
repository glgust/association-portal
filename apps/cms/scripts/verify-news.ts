import 'dotenv/config'

import { sql } from '@payloadcms/db-postgres'
import { randomUUID } from 'node:crypto'
import {
  createLocalReq,
  Forbidden,
  getPayload,
  type TypedUser,
  ValidationError,
} from 'payload'

import { GET as getNewsRoute } from '../src/app/api/v1/content/news/[slug]/route'
import { GET as listNewsRoute } from '../src/app/api/v1/content/news/route'
import config from '../src/payload.config'
import type { AuthUser, News } from '../src/payload-types'
import { authorize } from '../src/modules/authorization/authorize'
import { loadActor } from '../src/modules/authorization/load-actor'
import {
  getPublicNews,
  listPublicNews,
} from '../src/modules/content/news/public-read'
import { BusinessError } from '../src/modules/shared/business-error'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error('News integration test may only use local ascnucc_demo_test')
}

const payload = await getPayload({ config })
const runId = randomUUID()
const usernameEntropy = runId.replaceAll('-', '').slice(0, 20)
const fixtureUsernames = new Set<string>()
let fixtureUsernameSequence = 0

function fixtureUsername(scenario: string): string {
  fixtureUsernameSequence += 1
  const scenarioPrefix = scenario.replaceAll(/[^a-z0-9]/g, '').slice(0, 6)
  const username = `n${fixtureUsernameSequence}-${scenarioPrefix}-${usernameEntropy}`
  if (
    username.length > 32 ||
    !/^[a-z][a-z0-9._-]{2,31}$/.test(username) ||
    fixtureUsernames.has(username)
  ) {
    throw new Error('News fixture username invariant failed')
  }
  fixtureUsernames.add(username)
  return username
}

function body(text: string): News['body'] {
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
      displayName: `虚构新闻测试账号 ${suffix}`,
      password: 'Local-news-Only-2026!',
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
          'x-request-id': options.requestId ?? `news-${runId}`,
        }),
      },
      user: user ? typedUser(user) : undefined,
    },
    payload,
  )
  req.query = options.draft ? { draft: true } : {}
  return req
}

function assertPublicationContextCleared(
  req: Awaited<ReturnType<typeof requestFor>>,
  phase: string,
) {
  const leakedKeys = [
    'newsPublicationAction',
    'newsPublicationTime',
    'auditOperation',
  ].filter((key) => key in req.context)
  if (leakedKeys.length > 0) {
    throw new Error(
      `${phase} leaked News request context: ${leakedKeys.join(', ')}`,
    )
  }
}

async function assertSinglePublicationAudit(
  requestId: string,
  targetId: string,
  expectedAction: 'content.news.published' | 'content.news.unpublished',
) {
  const result = await payload.find({
    collection: 'audit-events',
    limit: 10,
    overrideAccess: true,
    where: { requestId: { equals: requestId } },
  })
  if (
    result.totalDocs !== 1 ||
    result.docs[0]?.action !== expectedAction ||
    result.docs[0]?.targetId !== targetId ||
    result.docs[0]?.targetType !== 'news' ||
    result.docs[0]?.result !== 'success'
  ) {
    throw new Error(
      `${expectedAction} did not produce exactly one matching News audit event`,
    )
  }
}

function newsData(title: string, summary: null | string = '纯虚构新闻摘要') {
  return { body: body(`${title}的虚构正文`), summary, title }
}

async function createDraft(
  user: Awaited<ReturnType<typeof ensureUser>>,
  title: string,
  summary?: null | string,
) {
  return payload.create({
    collection: 'news',
    data: newsData(title, summary),
    draft: true,
    overrideAccess: false,
    req: await requestFor(user, { draft: true }),
  })
}

async function publish(
  user: Awaited<ReturnType<typeof ensureUser>>,
  news: News,
  requestId = `publish-${runId}`,
) {
  return payload.update({
    collection: 'news',
    id: news.id,
    data: { ...news, _status: 'published' },
    overrideAccess: false,
    req: await requestFor(user, { requestId }),
  })
}

async function snapshotFor(id: string) {
  const [news, versions, audits] = await Promise.all([
    payload.findByID({
      collection: 'news',
      depth: 0,
      id,
      overrideAccess: true,
    }),
    payload.findVersions({
      collection: 'news',
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
  return { audits: audits.docs, news, versions: versions.docs }
}

async function assertRejectedWithoutChange(
  news: News,
  operation: () => Promise<unknown>,
  expected: 'forbidden' | 'validation',
) {
  const before = await snapshotFor(news.id)
  try {
    await operation()
    throw new Error(`Expected ${expected} News operation to fail`)
  } catch (error) {
    if (expected === 'forbidden' && !(error instanceof Forbidden)) throw error
    if (expected === 'validation' && !(error instanceof ValidationError)) {
      throw error
    }
  }
  if (JSON.stringify(await snapshotFor(news.id)) !== JSON.stringify(before)) {
    throw new Error(`${expected} News operation changed persistent state`)
  }
}

async function expectPublicNotFound(slug: string) {
  try {
    await getPublicNews(payload, await requestFor(), slug)
  } catch (error) {
    if (error instanceof BusinessError && error.code === 'NOT_FOUND') return
    throw error
  }
  throw new Error(`News ${slug} unexpectedly remained public`)
}

const editor = await ensureUser('editor')
const draft = await createDraft(
  editor,
  `  ＡＳＣＮＵＣＣ 虚构新闻 ${runId}  `,
  '   ',
)
if (
  draft._status !== 'draft' ||
  draft.summary !== null ||
  draft.title !== `ASCNUCC 虚构新闻 ${runId}` ||
  !draft.slug
) {
  throw new Error('News draft normalization or server slug failed')
}
await expectPublicNotFound(draft.slug)

const initial = await publish(editor, draft)
if (!initial.publishedAt)
  throw new Error('News publish did not set publishedAt')
const initialPublic = await getPublicNews(
  payload,
  await requestFor(),
  draft.slug,
)
if (initialPublic.title !== draft.title || 'root' in initialPublic.body) {
  throw new Error('News public detail leaked internal data')
}

await payload.update({
  collection: 'news',
  id: draft.id,
  data: {
    _status: 'draft',
    body: body('虚构新版正文'),
    summary: '  虚构新版摘要  ',
    title: '  虚构新版标题  ',
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const publicDuringDraft = await getPublicNews(
  payload,
  await requestFor(),
  draft.slug,
)
if (
  publicDuringDraft.title !== initialPublic.title ||
  publicDuringDraft.publishedAt !== initialPublic.publishedAt
) {
  throw new Error('Saving a News draft changed the current public version')
}
const changedDraft = await payload.findByID({
  collection: 'news',
  draft: true,
  id: draft.id,
  overrideAccess: true,
})
const changed = await publish(editor, changedDraft, `publish-change-${runId}`)
if (
  changed.title !== '虚构新版标题' ||
  changed.summary !== '虚构新版摘要' ||
  changed.publishedAt === initial.publishedAt
) {
  throw new Error('Publish Changes did not replace and retime public News')
}

for (const [value, field] of [
  ['标题\n换行', 'title'],
  ['摘要\r换行', 'summary'],
] as const) {
  await assertRejectedWithoutChange(
    changed,
    async () =>
      payload.update({
        collection: 'news',
        id: changed.id,
        data: { [field]: value },
        draft: true,
        overrideAccess: false,
        req: await requestFor(editor, { draft: true }),
      }),
    'validation',
  )
}

const incomplete = await payload.create({
  collection: 'news',
  data: { title: `不完整虚构新闻 ${runId}` },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
await assertRejectedWithoutChange(
  incomplete,
  () => publish(editor, incomplete),
  'validation',
)
await assertRejectedWithoutChange(
  incomplete,
  async () =>
    payload.update({
      collection: 'news',
      id: incomplete.id,
      data: { _status: 'draft' },
      overrideAccess: false,
      req: await requestFor(editor),
    }),
  'validation',
)

const rollbackDraft = await createDraft(editor, `审计回滚新闻 ${runId}`)
const failureRequestId = `news-audit-failure-${runId}`
const rollbackBefore = await snapshotFor(rollbackDraft.id)
const originalCreate = payload.create
const failureReq = await requestFor(editor, { requestId: failureRequestId })
payload.create = (async (options) => {
  if (
    options.collection === 'audit-events' &&
    (options.data as { requestId?: unknown }).requestId === failureRequestId
  ) {
    throw new Error('intentional News audit failure')
  }
  return originalCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await payload.update({
    collection: 'news',
    id: rollbackDraft.id,
    data: { ...rollbackDraft, _status: 'published' },
    overrideAccess: false,
    req: failureReq,
  })
  throw new Error('News publish unexpectedly survived audit failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional News audit failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalCreate
}
if (
  Object.keys(failureReq.context).some(
    (key) => key.startsWith('newsPublication') || key === 'auditOperation',
  )
) {
  throw new Error('Failed News request leaked publication audit context')
}
if (
  JSON.stringify(await snapshotFor(rollbackDraft.id)) !==
  JSON.stringify(rollbackBefore)
) {
  throw new Error('News audit failure did not roll back publish')
}

for (const role of ['staff', 'cadre', 'admin', 'owner'] as const) {
  const user = await ensureUser(`role-${role}`, role)
  const roleDraft = await createDraft(user, `虚构 ${role} 新闻 ${runId}`)
  if ((await publish(user, roleDraft))._status !== 'published') {
    throw new Error(`Role ${role} lost frozen content permissions`)
  }
}

const explicitlyAllowed = await ensureUser('explicit-allow')
const overrideGrantor = await ensureUser('override-grantor', 'admin')
await payload.create({
  collection: 'permission-overrides',
  data: {
    effect: 'allow',
    grantedAt: '2026-07-13T00:00:00.000Z',
    grantedBy: overrideGrantor.id,
    permission: 'content.directPublish',
    reason: '虚构新闻集成测试显式允许',
    scopeType: 'global',
    user: explicitlyAllowed.id,
  },
  overrideAccess: true,
})
const explicitAllowDraft = await createDraft(
  explicitlyAllowed,
  `显式允许发布新闻 ${runId}`,
)
const explicitPublishRequestId = `news-explicit-allow-publish-${runId}`
const explicitPublishReq = await requestFor(explicitlyAllowed, {
  requestId: explicitPublishRequestId,
})
const explicitActor = await loadActor(payload, explicitPublishReq)
if (!explicitActor) {
  throw new Error('Explicitly allowed News publisher did not load as an actor')
}
const explicitDecision = authorize(
  explicitActor,
  'content.directPublish',
  { type: 'global' },
  new Date(),
)
if (!explicitDecision.allowed || explicitDecision.reason !== 'explicit_allow') {
  throw new Error(
    `News direct publish did not consume the database explicit allow: ${explicitDecision.reason}`,
  )
}
const explicitlyPublished = await payload.update({
  collection: 'news',
  id: explicitAllowDraft.id,
  data: { ...explicitAllowDraft, _status: 'published' },
  overrideAccess: false,
  req: explicitPublishReq,
})
if (explicitlyPublished._status !== 'published') {
  throw new Error('Database explicit allow did not publish News')
}
assertPublicationContextCleared(explicitPublishReq, 'Successful News publish')
await assertSinglePublicationAudit(
  explicitPublishRequestId,
  explicitlyPublished.id,
  'content.news.published',
)
explicitPublishReq.query = { draft: true }
await payload.create({
  collection: 'news',
  data: newsData(`发布请求复用普通草稿 ${runId}`),
  draft: true,
  overrideAccess: false,
  req: explicitPublishReq,
})
assertPublicationContextCleared(
  explicitPublishReq,
  'Ordinary draft after successful News publish',
)
await assertSinglePublicationAudit(
  explicitPublishRequestId,
  explicitlyPublished.id,
  'content.news.published',
)

const explicitUnpublishRequestId = `news-explicit-allow-unpublish-${runId}`
const explicitUnpublishReq = await requestFor(explicitlyAllowed, {
  requestId: explicitUnpublishRequestId,
})
await payload.update({
  collection: 'news',
  id: explicitlyPublished.id,
  data: { _status: 'draft' },
  overrideAccess: false,
  req: explicitUnpublishReq,
})
assertPublicationContextCleared(
  explicitUnpublishReq,
  'Successful News unpublish',
)
await assertSinglePublicationAudit(
  explicitUnpublishRequestId,
  explicitlyPublished.id,
  'content.news.unpublished',
)
explicitUnpublishReq.query = { draft: true }
await payload.create({
  collection: 'news',
  data: newsData(`下线请求复用普通草稿 ${runId}`),
  draft: true,
  overrideAccess: false,
  req: explicitUnpublishReq,
})
assertPublicationContextCleared(
  explicitUnpublishReq,
  'Ordinary draft after successful News unpublish',
)
await assertSinglePublicationAudit(
  explicitUnpublishRequestId,
  explicitlyPublished.id,
  'content.news.unpublished',
)

const denied = await ensureUser('denied')
await payload.create({
  collection: 'permission-overrides',
  data: {
    effect: 'deny',
    grantedAt: '2026-07-13T00:00:00.000Z',
    grantedBy: overrideGrantor.id,
    permission: 'content.directPublish',
    reason: '虚构新闻集成测试显式拒绝',
    scopeType: 'global',
    user: denied.id,
  },
  overrideAccess: true,
})
const deniedDraft = await createDraft(denied, `显式拒绝新闻 ${runId}`)
await assertRejectedWithoutChange(
  deniedDraft,
  () => publish(denied, deniedDraft),
  'forbidden',
)

const expired = await ensureUser(
  'expired-account',
  'staff',
  '2020-01-01T00:00:00.000Z',
)
await assertRejectedWithoutChange(
  changed,
  async () =>
    payload.update({
      collection: 'news',
      id: changed.id,
      data: { title: '过期账号不得修改' },
      draft: true,
      overrideAccess: false,
      req: await requestFor(expired, { draft: true }),
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
    reason: '虚构新闻集成测试过期拒绝',
    scopeType: 'global',
    user: expiredDeny.id,
  },
  overrideAccess: true,
})
const expiredDenyDraft = await createDraft(expiredDeny, `过期权限新闻 ${runId}`)
await publish(expiredDeny, expiredDenyDraft)

const invalidScope = await ensureUser('invalid-scope')
const cycle = await payload.create({
  collection: 'recruitment-cycles',
  data: { code: `news-${runId}`, name: '虚构新闻届次', status: 'draft' },
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
      reason: '虚构新闻集成测试届次范围拒绝',
      recruitmentCycle: cycle.id,
      scopeType: 'recruitmentCycle',
      user: invalidScope.id,
    },
    overrideAccess: true,
  })
  throw new Error(
    'Malformed News override unexpectedly passed Collection validation',
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
  throw new Error('Rejected News override changed PermissionOverride data')
}

const { rows: invalidScopeRows } = await payload.db.drizzle.execute(sql`
  INSERT INTO "permission_overrides" (
    "user_id", "permission", "effect", "scope_type",
    "recruitment_cycle_id", "reason", "granted_by_id", "granted_at"
  ) VALUES (
    ${invalidScope.id}, 'content.directPublish', 'deny', 'recruitmentCycle',
    ${cycle.id}, '虚构新闻集成测试届次范围拒绝', ${overrideGrantor.id},
    '2026-07-13T00:00:00.000Z'
  )
  RETURNING "id"
`)
const invalidScopeOverrideId = (
  invalidScopeRows[0] as { id?: string } | undefined
)?.id
if (!invalidScopeOverrideId || invalidScopeRows.length !== 1) {
  throw new Error('Malformed News override SQL fixture was not identified')
}
try {
  await assertRejectedWithoutChange(
    rollbackDraft,
    () => publish(invalidScope, rollbackDraft),
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
    throw new Error('Malformed News override SQL fixture was not deleted')
  }
}

const beforeAnonymous = await payload.count({
  collection: 'news',
  overrideAccess: true,
})
try {
  await payload.create({
    collection: 'news',
    data: newsData(`匿名新闻 ${runId}`),
    draft: true,
    overrideAccess: false,
    req: await requestFor(undefined, { draft: true }),
  })
  throw new Error('Anonymous News create unexpectedly succeeded')
} catch (error) {
  if (!(error instanceof Forbidden)) throw error
}
if (
  (await payload.count({ collection: 'news', overrideAccess: true }))
    .totalDocs !== beforeAnonymous.totalDocs
) {
  throw new Error('Anonymous News rejection changed the database')
}

const tieFirst = await publish(
  editor,
  await createDraft(editor, `排序甲新闻 ${runId}`),
)
const tieSecond = await publish(
  editor,
  await createDraft(editor, `排序乙新闻 ${runId}`),
)
const tieTime = '2026-07-19T06:00:00.000Z'
await payload.db.drizzle.execute(sql`
  UPDATE "news"
  SET "published_at" = ${tieTime}
  WHERE "id" IN (${tieFirst.id}, ${tieSecond.id})
`)
const publicPage = await listPublicNews(payload, await requestFor(), {
  page: 1,
  pageSize: 50,
})
const ties = publicPage.items.filter((item) =>
  [tieFirst.id, tieSecond.id].includes(item.id),
)
if (
  ties.length !== 2 ||
  ties[0]?.id !== [tieFirst.id, tieSecond.id].sort()[0]
) {
  throw new Error('News list did not use stable publishedAt/id sorting')
}
if (
  publicPage.items.some((item) =>
    /_status|createdBy|lastEditedBy|root/.test(JSON.stringify(item)),
  )
) {
  throw new Error('News list leaked internal fields')
}

await payload.db.drizzle.execute(sql`
  UPDATE "news" SET "title" = E'非法\\n标题' WHERE "id" = ${changed.id}
`)
const malformedListResponse = await listNewsRoute(
  new Request('http://localhost/api/v1/content/news?page=1&pageSize=50', {
    headers: { 'x-request-id': `malformed-list-${runId}` },
  }),
)
const malformedDetailResponse = await getNewsRoute(
  new Request(`http://localhost/api/v1/content/news/${changed.slug}`, {
    headers: { 'x-request-id': `malformed-detail-${runId}` },
  }),
  { params: Promise.resolve({ slug: changed.slug }) },
)
try {
  if (
    malformedListResponse.status !== 500 ||
    malformedDetailResponse.status !== 500
  ) {
    throw new Error(
      `Malformed published News did not fail closed: list=${malformedListResponse.status}, detail=${malformedDetailResponse.status}`,
    )
  }
} finally {
  await payload.db.drizzle.execute(sql`
    UPDATE "news" SET "title" = '虚构新版标题' WHERE "id" = ${changed.id}
  `)
}

const unpublishFailureId = `news-audit-unpublish-failure-${runId}`
await assertRejectedWithoutChange(
  changed,
  async () =>
    payload.update({
      collection: 'news',
      id: changed.id,
      data: { _status: 'draft' },
      overrideAccess: false,
      req: await requestFor(denied),
    }),
  'forbidden',
)
const unpublishFailureReq = await requestFor(editor, {
  requestId: unpublishFailureId,
})
const beforeUnpublishFailure = await snapshotFor(changed.id)
payload.create = (async (options) => {
  if (
    options.collection === 'audit-events' &&
    (options.data as { requestId?: unknown }).requestId === unpublishFailureId
  ) {
    throw new Error('intentional News unpublish audit failure')
  }
  return originalCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await payload.update({
    collection: 'news',
    id: changed.id,
    data: { _status: 'draft' },
    overrideAccess: false,
    req: unpublishFailureReq,
  })
  throw new Error('News unpublish unexpectedly survived audit failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional News unpublish audit failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalCreate
}
if (
  JSON.stringify(await snapshotFor(changed.id)) !==
    JSON.stringify(beforeUnpublishFailure) ||
  Object.keys(unpublishFailureReq.context).some(
    (key) => key.startsWith('newsPublication') || key === 'auditOperation',
  )
) {
  throw new Error('News unpublish audit failure did not fully roll back')
}

const beforeUnpublish = changed.publishedAt
await payload.update({
  collection: 'news',
  id: changed.id,
  data: { _status: 'draft' },
  overrideAccess: false,
  req: await requestFor(editor, { requestId: `unpublish-${runId}` }),
})
await expectPublicNotFound(changed.slug)
const unpublished = await payload.findByID({
  collection: 'news',
  draft: true,
  id: changed.id,
  overrideAccess: true,
})
if (unpublished.publishedAt !== beforeUnpublish) {
  throw new Error('Unpublish forged a new News publication time')
}
await assertRejectedWithoutChange(
  unpublished,
  async () =>
    payload.update({
      collection: 'news',
      id: unpublished.id,
      data: { _status: 'draft' },
      overrideAccess: false,
      req: await requestFor(editor),
    }),
  'validation',
)

const audits = await payload.find({
  collection: 'audit-events',
  limit: 10,
  overrideAccess: true,
  where: { targetId: { equals: changed.id } },
})
if (
  audits.totalDocs !== 3 ||
  audits.docs.some((audit) => {
    const serialized = JSON.stringify(audit)
    return (
      audit.targetType !== 'news' ||
      audit.result !== 'success' ||
      /虚构新版标题|虚构新版摘要|虚构新版正文/.test(serialized)
    )
  })
) {
  throw new Error('News audit trail is incomplete or leaked content')
}

payload.logger.info(
  `News publication passed: drafts, publish changes, unpublish, permissions, rollback, sorting, and fail-closed mapping (${runId})`,
)
process.exit(0)
