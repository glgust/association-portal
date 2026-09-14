import 'dotenv/config'

import { randomUUID } from 'node:crypto'
import {
  createLocalReq,
  Forbidden,
  getPayload,
  type TypedUser,
  ValidationError,
} from 'payload'

import config from '../src/payload.config'
import type { Announcement } from '../src/payload-types'
import {
  getPublicAnnouncement,
  listPublicAnnouncements,
} from '../src/modules/content/announcements/public-read'
import { BusinessError } from '../src/modules/shared/business-error'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Announcement integration test may only use local ascnucc_demo_test',
  )
}

const payload = await getPayload({ config })
const runId = randomUUID()
const usernameEntropy = runId.replaceAll('-', '').slice(0, 20)
const fixtureUsernames = new Set<string>()

function fixtureUsername(scenarioPrefix: string): string {
  const username = `${scenarioPrefix}-${usernameEntropy}`
  if (
    username.length > 32 ||
    !/^[a-z][a-z0-9._-]{2,31}$/.test(username) ||
    fixtureUsernames.has(username)
  ) {
    throw new Error('Announcement fixture username invariant failed')
  }
  fixtureUsernames.add(username)
  return username
}

async function protectedAuthState(userId: string): Promise<string> {
  const [account, sessions] = await Promise.all([
    payload.db.pool.query<{ snapshot: unknown }>(
      'SELECT to_jsonb(auth_users) AS snapshot FROM auth_users WHERE id = $1',
      [userId],
    ),
    payload.db.pool.query<{ snapshot: unknown }>(
      'SELECT to_jsonb(auth_users_sessions) AS snapshot FROM auth_users_sessions WHERE _parent_id = $1 ORDER BY id',
      [userId],
    ),
  ])
  if (account.rowCount !== 1) {
    throw new Error('Protected AuthUser snapshot could not be read')
  }
  return JSON.stringify({
    account: account.rows[0]?.snapshot,
    sessions: sessions.rows.map((row) => row.snapshot),
  })
}

function body(text: string): Announcement['body'] {
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

async function ensureUser(username: string, role: 'admin' | 'staff' = 'staff') {
  const existing = await payload.find({
    collection: 'auth-users',
    limit: 1,
    overrideAccess: true,
    where: { username: { equals: username } },
  })
  if (existing.docs[0]) return existing.docs[0]
  return payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'external',
      displayName: '虚构公告集成测试账号',
      password: 'Local-announcement-Only-2026!',
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

async function requestFor(
  user?: Awaited<ReturnType<typeof ensureUser>>,
  options: { draft?: boolean; requestId?: string } = {},
) {
  const req = await createLocalReq(
    {
      req: {
        headers: new Headers({
          'x-request-id': options.requestId ?? `announcement-${runId}`,
        }),
      },
      user: user ? typedUser(user) : undefined,
    },
    payload,
  )
  req.query = options.draft ? { draft: true } : {}
  return req
}

async function expectPublicNotFound(slug: string): Promise<void> {
  try {
    await getPublicAnnouncement(payload, await requestFor(), slug)
  } catch (error) {
    if (error instanceof BusinessError && error.code === 'NOT_FOUND') return
    throw error
  }
  throw new Error(`Announcement ${slug} unexpectedly remained public`)
}

const editor = await ensureUser(fixtureUsername('ann-edit'))
const initialTitle = `虚构公告 ${runId}`
const initialBody = body('第一版公开内容')
const draft = await payload.create({
  collection: 'announcements',
  data: { body: initialBody, summary: '虚构公告摘要', title: initialTitle },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
if (draft._status !== 'draft' || !draft.slug) {
  throw new Error('Announcement draft did not receive draft status and slug')
}
await expectPublicNotFound(draft.slug)

const protectedEditorBefore = await protectedAuthState(editor.id)
let protectedEditorRejected = false
try {
  await payload.update({
    collection: 'auth-users',
    id: editor.id,
    data: {
      accessExpiresAt: '2099-12-31T23:59:59.000Z',
      role: 'owner',
    },
    overrideAccess: false,
    req: await requestFor(editor),
  })
} catch (error) {
  if (error instanceof Forbidden && error.status === 403) {
    protectedEditorRejected = true
  } else {
    throw error
  }
}
if (!protectedEditorRejected) {
  throw new Error('AuthUser self-update was not rejected with 403')
}
if ((await protectedAuthState(editor.id)) !== protectedEditorBefore) {
  throw new Error(
    'Rejected AuthUser self-update changed account or Session state',
  )
}

const rollbackDraft = await payload.create({
  collection: 'announcements',
  data: {
    body: body('审计失败时不得公开的正文'),
    title: `审计回滚公告 ${runId}`,
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const rollbackEditor = await ensureUser(fixtureUsername('ann-roll'))
const rollbackSnapshot = {
  body: JSON.stringify(rollbackDraft.body),
  lastEditedBy: JSON.stringify(rollbackDraft.lastEditedBy),
  publishedAt: rollbackDraft.publishedAt,
  status: rollbackDraft._status,
  summary: rollbackDraft.summary,
  title: rollbackDraft.title,
  updatedAt: rollbackDraft.updatedAt,
}
const [rollbackVersionsBefore, rollbackAuditsBefore] = await Promise.all([
  payload.countVersions({
    collection: 'announcements',
    overrideAccess: true,
    where: { parent: { equals: rollbackDraft.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: rollbackDraft.id } },
  }),
])
const auditFailureRequestId = `audit-failure-${runId}`
const originalPayloadCreate = payload.create
payload.create = (async (options) => {
  const auditData = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    auditData.requestId === auditFailureRequestId
  ) {
    throw new Error('intentional audit write failure')
  }
  return originalPayloadCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await payload.update({
    collection: 'announcements',
    id: rollbackDraft.id,
    data: {
      _status: 'published',
      body: body('若事务未回滚，这段不同正文会残留'),
      summary: '若事务未回滚，这段不同摘要会残留',
      title: `若事务未回滚会残留的标题 ${runId}`,
    },
    overrideAccess: false,
    req: await requestFor(rollbackEditor, {
      requestId: auditFailureRequestId,
    }),
  })
  throw new Error('Publish unexpectedly survived an audit write failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional audit write failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalPayloadCreate
}
const [rollbackAfter, rollbackVersionsAfter, rollbackAuditsAfter] =
  await Promise.all([
    payload.findByID({
      collection: 'announcements',
      id: rollbackDraft.id,
      overrideAccess: true,
    }),
    payload.countVersions({
      collection: 'announcements',
      overrideAccess: true,
      where: { parent: { equals: rollbackDraft.id } },
    }),
    payload.count({
      collection: 'audit-events',
      overrideAccess: true,
      where: { targetId: { equals: rollbackDraft.id } },
    }),
  ])
if (
  JSON.stringify(rollbackAfter.body) !== rollbackSnapshot.body ||
  JSON.stringify(rollbackAfter.lastEditedBy) !==
    rollbackSnapshot.lastEditedBy ||
  rollbackAfter._status !== rollbackSnapshot.status ||
  rollbackAfter.publishedAt !== rollbackSnapshot.publishedAt ||
  rollbackAfter.summary !== rollbackSnapshot.summary ||
  rollbackAfter.title !== rollbackSnapshot.title ||
  rollbackAfter.updatedAt !== rollbackSnapshot.updatedAt ||
  rollbackVersionsAfter.totalDocs !== rollbackVersionsBefore.totalDocs ||
  rollbackAuditsAfter.totalDocs !== rollbackAuditsBefore.totalDocs
) {
  throw new Error(
    'Audit write failure did not roll back publication atomically',
  )
}
await expectPublicNotFound(rollbackDraft.slug)

const published = await payload.update({
  collection: 'announcements',
  id: draft.id,
  data: {
    _status: 'published',
    body: initialBody,
    summary: draft.summary,
    title: draft.title,
  },
  overrideAccess: false,
  req: await requestFor(editor, { requestId: `publish-${runId}` }),
})
if (published._status !== 'published' || !published.publishedAt) {
  throw new Error('Announcement publish did not set publishedAt')
}
const firstPublic = await getPublicAnnouncement(
  payload,
  await requestFor(),
  draft.slug,
)
if (firstPublic.title !== initialTitle) {
  throw new Error('Published announcement was not publicly readable')
}

const revisedTitle = `${initialTitle}（新版）`
const revisedBody = body('第二版公开内容')
await payload.update({
  collection: 'announcements',
  id: draft.id,
  data: { _status: 'draft', body: revisedBody, title: revisedTitle },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const stillPublic = await getPublicAnnouncement(
  payload,
  await requestFor(),
  draft.slug,
)
if (stillPublic.title !== initialTitle) {
  throw new Error('Saving a newer draft changed the public announcement')
}

try {
  await payload.update({
    collection: 'announcements',
    id: draft.id,
    data: { slug: `tampered-${runId}` },
    draft: true,
    overrideAccess: false,
    req: await requestFor(editor, { draft: true }),
  })
  throw new Error('Announcement slug modification unexpectedly succeeded')
} catch (error) {
  if (!(error instanceof ValidationError)) throw error
}

const republished = await payload.update({
  collection: 'announcements',
  id: draft.id,
  data: {
    _status: 'published',
    body: revisedBody,
    summary: draft.summary,
    title: revisedTitle,
  },
  overrideAccess: false,
  req: await requestFor(editor, { requestId: `republish-${runId}` }),
})
const revisedPublic = await getPublicAnnouncement(
  payload,
  await requestFor(),
  draft.slug,
)
if (
  republished._status !== 'published' ||
  revisedPublic.title !== revisedTitle
) {
  throw new Error('Publishing the newer draft did not replace public content')
}

const page = await listPublicAnnouncements(payload, await requestFor(), {
  page: 1,
  pageSize: 50,
})
if (!page.items.some((item) => item.id === draft.id)) {
  throw new Error('Published announcement is missing from the public list')
}

await payload.update({
  collection: 'announcements',
  id: draft.id,
  data: { _status: 'draft' },
  overrideAccess: false,
  req: await requestFor(editor, { requestId: `unpublish-${runId}` }),
})
await expectPublicNotFound(draft.slug)

const publicationAudits = await payload.find({
  collection: 'audit-events',
  limit: 10,
  overrideAccess: true,
  where: { targetId: { equals: draft.id } },
})
if (
  publicationAudits.totalDocs !== 3 ||
  publicationAudits.docs.some((audit) => {
    const actorId =
      typeof audit.actor === 'string' ? audit.actor : audit.actor?.id
    return (
      actorId !== editor.id ||
      audit.result !== 'success' ||
      audit.targetType !== 'announcement'
    )
  })
) {
  throw new Error('Publish/Unpublish audit trail is incomplete')
}

const deniedEditor = await ensureUser(fixtureUsername('ann-deny'))
const overrideGrantor = await ensureUser(fixtureUsername('ann-grant'), 'admin')
await payload.create({
  collection: 'permission-overrides',
  data: {
    effect: 'deny',
    grantedAt: '2026-07-13T00:00:00.000Z',
    grantedBy: overrideGrantor.id,
    permission: 'content.directPublish',
    reason: '虚构公告集成测试显式拒绝',
    scopeType: 'global',
    user: deniedEditor.id,
  },
  overrideAccess: true,
})
const announcementsBeforeDeniedCreate = await payload.count({
  collection: 'announcements',
  overrideAccess: true,
})
try {
  await payload.create({
    collection: 'announcements',
    data: {
      body: body('越权直接创建公开公告'),
      createdBy: deniedEditor.id,
      lastEditedBy: deniedEditor.id,
      slug: `ignored-${runId}`,
      title: `越权直接发布 ${runId}`,
    },
    draft: false,
    overrideAccess: false,
    req: await requestFor(deniedEditor),
  })
  throw new Error('Denied editor directly created a published announcement')
} catch (error) {
  if (!(error instanceof Forbidden)) throw error
}
const announcementsAfterDeniedCreate = await payload.count({
  collection: 'announcements',
  overrideAccess: true,
})
if (
  announcementsAfterDeniedCreate.totalDocs !==
  announcementsBeforeDeniedCreate.totalDocs
) {
  throw new Error('Forbidden direct create changed announcement data')
}
const deniedDraft = await payload.create({
  collection: 'announcements',
  data: { body: body('禁止发布的草稿'), title: `禁止发布 ${runId}` },
  draft: true,
  overrideAccess: false,
  req: await requestFor(deniedEditor, { draft: true }),
})
const [versionsBefore, auditsBefore] = await Promise.all([
  payload.countVersions({
    collection: 'announcements',
    overrideAccess: true,
    where: { parent: { equals: deniedDraft.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: deniedDraft.id } },
  }),
])
try {
  await payload.update({
    collection: 'announcements',
    id: deniedDraft.id,
    data: {
      _status: 'published',
      body: deniedDraft.body,
      title: deniedDraft.title,
    },
    overrideAccess: false,
    req: await requestFor(deniedEditor),
  })
  throw new Error('Explicitly denied editor unexpectedly published')
} catch (error) {
  if (!(error instanceof Forbidden)) throw error
}
const [deniedAfter, versionsAfter, auditsAfter] = await Promise.all([
  payload.findByID({
    collection: 'announcements',
    id: deniedDraft.id,
    overrideAccess: true,
  }),
  payload.countVersions({
    collection: 'announcements',
    overrideAccess: true,
    where: { parent: { equals: deniedDraft.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: deniedDraft.id } },
  }),
])
if (
  deniedAfter._status !== 'draft' ||
  versionsAfter.totalDocs !== versionsBefore.totalDocs ||
  auditsAfter.totalDocs !== auditsBefore.totalDocs
) {
  throw new Error('Forbidden publish changed announcement data or audit state')
}

const protectedDraft = await payload.create({
  collection: 'announcements',
  data: {
    body: body('不可被越权修改的公开正文'),
    title: `受保护公告 ${runId}`,
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const protectedPublished = await payload.update({
  collection: 'announcements',
  id: protectedDraft.id,
  data: {
    _status: 'published',
    body: protectedDraft.body,
    title: protectedDraft.title,
  },
  overrideAccess: false,
  req: await requestFor(editor),
})
const [protectedVersionsBefore, protectedAuditsBefore] = await Promise.all([
  payload.countVersions({
    collection: 'announcements',
    overrideAccess: true,
    where: { parent: { equals: protectedDraft.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: protectedDraft.id } },
  }),
])

try {
  await payload.update({
    collection: 'announcements',
    id: protectedDraft.id,
    data: {
      body: body('越权修改不应公开'),
      title: `越权修改 ${runId}`,
    },
    overrideAccess: false,
    req: await requestFor(deniedEditor),
  })
  throw new Error('Denied editor changed a published announcement implicitly')
} catch (error) {
  if (!(error instanceof Forbidden)) throw error
}

try {
  await payload.update({
    collection: 'announcements',
    id: protectedDraft.id,
    data: { _status: 'draft' },
    overrideAccess: false,
    req: await requestFor(deniedEditor),
  })
  throw new Error('Denied editor unpublished a published announcement')
} catch (error) {
  if (!(error instanceof Forbidden)) throw error
}

const [protectedAfter, protectedVersionsAfter, protectedAuditsAfter] =
  await Promise.all([
    payload.findByID({
      collection: 'announcements',
      id: protectedDraft.id,
      overrideAccess: true,
    }),
    payload.countVersions({
      collection: 'announcements',
      overrideAccess: true,
      where: { parent: { equals: protectedDraft.id } },
    }),
    payload.count({
      collection: 'audit-events',
      overrideAccess: true,
      where: { targetId: { equals: protectedDraft.id } },
    }),
  ])

if (
  protectedAfter._status !== 'published' ||
  protectedAfter.title !== protectedPublished.title ||
  JSON.stringify(protectedAfter.body) !==
    JSON.stringify(protectedPublished.body) ||
  protectedVersionsAfter.totalDocs !== protectedVersionsBefore.totalDocs ||
  protectedAuditsAfter.totalDocs !== protectedAuditsBefore.totalDocs
) {
  throw new Error(
    'Forbidden implicit publish or unpublish changed data, versions, or audit state',
  )
}

try {
  await payload.delete({
    collection: 'announcements',
    id: deniedDraft.id,
    overrideAccess: false,
    req: await requestFor(deniedEditor),
  })
  throw new Error('Physical announcement deletion unexpectedly succeeded')
} catch (error) {
  if (!(error instanceof Forbidden)) throw error
}

payload.logger.info(
  `Announcement publication passed: drafts, publish, version isolation, unpublish, protected account fields, audit rollback and forbidden live-write zero-change (${runId})`,
)
process.exit(0)
