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

import config from '../src/payload.config'
import type { AuthUser, GalleryWork, MediaAsset } from '../src/payload-types'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Gallery transaction probe may only use local ascnucc_demo_test',
  )
}

const payload = await getPayload({ config })
const runId = randomUUID()
const password = 'Local-gallery-r1-Only-2026!'

async function user(
  suffix: string,
  input: Partial<Pick<AuthUser, 'accessExpiresAt' | 'role' | 'status'>> = {},
) {
  return payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'external',
      displayName: `虚构画廊事务账号 ${suffix}`,
      password,
      recordVersion: 1,
      role: input.role ?? 'staff',
      status: input.status ?? 'active',
      username: `g-${suffix.slice(0, 6)}-${runId.replaceAll('-', '').slice(0, 16)}`,
      ...(input.accessExpiresAt
        ? { accessExpiresAt: input.accessExpiresAt }
        : {}),
    },
    overrideAccess: true,
  })
}

function typed(value: AuthUser): TypedUser {
  return { ...value, collection: 'auth-users' } as TypedUser
}

async function req(value?: AuthUser, requestId = `gallery-r1-${runId}`) {
  const result = await createLocalReq(
    {
      req: { headers: new Headers({ 'x-request-id': requestId }) },
      user: value ? typed(value) : undefined,
    },
    payload,
  )
  result.query = {}
  return result
}

async function draftReq(value: AuthUser) {
  const result = await req(value)
  result.query = { draft: true }
  return result
}

async function createDraft(editor: AuthUser, media: MediaAsset, label: string) {
  return payload.create({
    collection: 'gallery-works',
    data: {
      altText: '虚构事务测试图片，无真实人物',
      author: editor.id,
      displayRightsConfirmed: false,
      media: media.id,
      penName: '虚构事务作者',
      recognizablePeople: null,
      title: `${label} ${runId}`,
    },
    draft: true,
    overrideAccess: false,
    req: await draftReq(editor),
  })
}

async function publish(editor: AuthUser, work: GalleryWork, requestId: string) {
  return payload.update({
    collection: 'gallery-works',
    data: {
      ...work,
      _status: 'published',
      displayRightsConfirmed: true,
      recognizablePeople: 'none',
    },
    id: work.id,
    overrideAccess: false,
    req: await req(editor, requestId),
  })
}

async function unpublish(
  editor: AuthUser,
  work: GalleryWork,
  requestId: string,
) {
  return payload.update({
    collection: 'gallery-works',
    data: { ...work, _status: 'draft' },
    id: work.id,
    overrideAccess: false,
    req: await req(editor, requestId),
  })
}

async function snapshot(id: string) {
  const [main, versions, published, audits] = await Promise.all([
    payload.findByID({
      collection: 'gallery-works',
      depth: 0,
      draft: true,
      id,
      overrideAccess: true,
    }),
    payload.findVersions({
      collection: 'gallery-works',
      depth: 0,
      limit: 50,
      overrideAccess: true,
      sort: 'id',
      where: { parent: { equals: id } },
    }),
    payload.find({
      collection: 'gallery-works',
      depth: 0,
      draft: false,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [{ id: { equals: id } }, { _status: { equals: 'published' } }],
      },
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
  return {
    audits: audits.docs,
    main,
    published: published.docs,
    versions: versions.docs,
  }
}

async function rejectedWithoutChange(
  work: GalleryWork,
  operation: () => Promise<unknown>,
  kind: 'forbidden' | 'validation',
) {
  const before = JSON.stringify(await snapshot(work.id))
  try {
    await operation()
    throw new Error(`Expected Gallery ${kind} rejection`)
  } catch (error) {
    if (kind === 'forbidden' && !(error instanceof Forbidden)) throw error
    if (kind === 'validation' && !(error instanceof ValidationError)) {
      throw error
    }
  }
  if (JSON.stringify(await snapshot(work.id)) !== before) {
    throw new Error(`Gallery ${kind} rejection changed persistent state`)
  }
}

async function failAudit(
  operation: () => Promise<unknown>,
  work: GalleryWork,
  requestId: string,
) {
  const before = JSON.stringify(await snapshot(work.id))
  const originalCreate = payload.create
  payload.create = (async (options) => {
    if (
      options.collection === 'audit-events' &&
      (options.data as { requestId?: unknown }).requestId === requestId
    ) {
      throw new Error('intentional Gallery audit failure')
    }
    return originalCreate.call(payload, options as never)
  }) as typeof payload.create
  try {
    await operation()
    throw new Error('Gallery operation unexpectedly survived audit failure')
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'intentional Gallery audit failure'
    ) {
      throw error
    }
  } finally {
    payload.create = originalCreate
  }
  if (JSON.stringify(await snapshot(work.id)) !== before) {
    throw new Error(
      'Gallery main row, versions, public version, or AuditEvent escaped rollback',
    )
  }
}

const mediaResult = await payload.find({
  collection: 'media-assets',
  depth: 0,
  limit: 1,
  overrideAccess: true,
})
const media = mediaResult.docs[0]
if (!media) throw new Error('Run the fictional E2E seed before this probe')

const editor = await user('editor')
const manager = await user('manager', { role: 'admin' })
const successful = await createDraft(editor, media, '成功发布下线')
const published = await publish(editor, successful, `publish-${runId}`)
if (published._status !== 'published') throw new Error('Publish failed')
const unpublished = await unpublish(editor, published, `unpublish-${runId}`)
if (unpublished._status !== 'draft') throw new Error('Unpublish failed')
await rejectedWithoutChange(
  unpublished,
  () => unpublish(editor, unpublished, `repeat-unpublish-${runId}`),
  'validation',
)

const neverPublished = await createDraft(editor, media, '从未发布')
await rejectedWithoutChange(
  neverPublished,
  () => unpublish(editor, neverPublished, `never-unpublish-${runId}`),
  'validation',
)

const publishRollback = await createDraft(editor, media, '发布审计回滚')
await failAudit(
  () => publish(editor, publishRollback, `publish-audit-fail-${runId}`),
  publishRollback,
  `publish-audit-fail-${runId}`,
)
const unpublishRollbackDraft = await createDraft(editor, media, '下线审计回滚')
const unpublishRollback = await publish(
  editor,
  unpublishRollbackDraft,
  `publish-before-unpublish-fail-${runId}`,
)
await failAudit(
  () => unpublish(editor, unpublishRollback, `unpublish-audit-fail-${runId}`),
  unpublishRollback,
  `unpublish-audit-fail-${runId}`,
)

const denied = await user('denied')
await payload.create({
  collection: 'permission-overrides',
  data: {
    effect: 'deny',
    grantedAt: new Date().toISOString(),
    grantedBy: manager.id,
    permission: 'content.directPublish',
    reason: '虚构 Gallery R1 deny',
    scopeType: 'global',
    user: denied.id,
  },
  overrideAccess: true,
})
const deniedWork = await createDraft(denied, media, '显式拒绝')
await rejectedWithoutChange(
  deniedWork,
  () => publish(denied, deniedWork, `deny-${runId}`),
  'forbidden',
)

const expired = await user('expired', {
  accessExpiresAt: '2026-01-01T00:00:00.000Z',
})
const expiredWork = await createDraft(editor, media, '过期拒绝')
await rejectedWithoutChange(
  expiredWork,
  () => publish(expired, expiredWork, `expired-${runId}`),
  'forbidden',
)

const disabled = await user('disabled', { status: 'disabled' })
const disabledWork = await createDraft(editor, media, '停用拒绝')
await rejectedWithoutChange(
  disabledWork,
  () => publish(disabled, disabledWork, `disabled-${runId}`),
  'forbidden',
)

const illegal = await user('illegal', { role: 'member' })
try {
  await payload.db.drizzle.execute(sql`
    INSERT INTO permission_overrides (
      id, user_id, permission, effect, scope_type, recruitment_cycle_id,
      granted_by_id, granted_at, reason, updated_at, created_at
    ) VALUES (
      ${randomUUID()}, ${illegal.id}, 'content.directPublish', 'allow',
      'recruitmentCycle', NULL, ${manager.id}, NOW(),
      'fictional invalid scope probe', NOW(), NOW()
    )
  `)
  throw new Error('Database accepted an illegal global permission scope')
} catch (error) {
  if (
    error instanceof Error &&
    error.message === 'Database accepted an illegal global permission scope'
  ) {
    throw error
  }
}
const illegalWork = await createDraft(editor, media, '非法 Scope 拒绝')
await rejectedWithoutChange(
  illegalWork,
  () => publish(illegal, illegalWork, `illegal-${runId}`),
  'forbidden',
)

await payload.destroy()
console.log(
  'Gallery PostgreSQL transactions passed: publish/unpublish, audit rollback, and zero-change rejection matrix',
)
process.exit(0)
