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
import type { AssociationPage } from '../src/payload-types'
import { getPublicAssociationPage } from '../src/modules/content/association-pages/public-read'
import { BusinessError } from '../src/modules/shared/business-error'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Association page integration test may only use local ascnucc_demo_test',
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
    throw new Error('Association fixture username invariant failed')
  }
  fixtureUsernames.add(username)
  return username
}

const stalePages = await payload.find({
  collection: 'association-pages',
  limit: 10,
  overrideAccess: true,
})
for (const page of stalePages.docs) {
  await payload.delete({
    collection: 'association-pages',
    id: page.id,
    overrideAccess: true,
  })
}

function body(text: string): AssociationPage['body'] {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
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
      displayName: '虚构协会页面集成测试账号',
      password: 'Local-association-Only-2026!',
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
          'x-request-id': options.requestId ?? `association-${runId}`,
        }),
      },
      user: user ? typedUser(user) : undefined,
    },
    payload,
  )
  req.query = options.draft ? { draft: true } : {}
  return req
}

async function expectNotFound(pageKey: string) {
  try {
    await getPublicAssociationPage(payload, await requestFor(), pageKey)
  } catch (error) {
    if (error instanceof BusinessError && error.code === 'NOT_FOUND') return
    throw error
  }
  throw new Error(`${pageKey} unexpectedly remained public`)
}

const editor = await ensureUser(fixtureUsername('assoc-edit'))
const pages = new Map<'about' | 'contact' | 'home', AssociationPage>()

for (const pageKey of ['home', 'about', 'contact'] as const) {
  const data = {
    body: body(`虚构 ${pageKey} 第一版正文 ${runId}`),
    pageKey,
    title: `虚构 ${pageKey} 页面 ${runId}`,
    ...(pageKey === 'home' ? { lead: '虚构首页引导语' } : {}),
    ...(pageKey === 'contact'
      ? {
          contacts: [
            {
              contactId: '00000000-0000-4000-8000-000000000000',
              isPublic: true,
              label: '虚构协会邮箱',
              showOnHome: true,
              type: 'email',
              value: 'association@example.test',
            },
          ],
        }
      : {}),
  }
  const draft = await payload.create({
    collection: 'association-pages',
    data: data as never,
    draft: true,
    overrideAccess: false,
    req: await requestFor(editor, { draft: true }),
  })
  if (draft._status !== 'draft') throw new Error(`${pageKey} was not a draft`)
  pages.set(pageKey, draft)
  await expectNotFound(pageKey)
}

const contactDraft = pages.get('contact')!
const generatedContact = contactDraft.contacts?.[0]
if (
  !generatedContact?.contactId ||
  generatedContact.contactId === '00000000-0000-4000-8000-000000000000'
) {
  throw new Error('New contactId was not generated by the server')
}

try {
  await payload.update({
    collection: 'association-pages',
    id: contactDraft.id,
    data: {
      contacts: contactDraft.contacts?.map((contact) => ({
        ...contact,
        contactId: '44baef57-4b1a-4a59-b6a1-aa46aafdddc1',
      })),
    },
    draft: true,
    overrideAccess: false,
    req: await requestFor(editor, { draft: true }),
  })
  throw new Error('Existing contactId tampering unexpectedly succeeded')
} catch (error) {
  if (!(error instanceof ValidationError)) throw error
}

try {
  await payload.create({
    collection: 'association-pages',
    data: {
      body: body('重复页面不得保存'),
      pageKey: 'home',
      title: '重复首页',
    },
    draft: true,
    overrideAccess: false,
    req: await requestFor(editor, { draft: true }),
  })
  throw new Error('Duplicate fixed page unexpectedly succeeded')
} catch (error) {
  if (!(error instanceof ValidationError)) throw error
}

for (const pageKey of ['home', 'about', 'contact'] as const) {
  const draft = pages.get(pageKey)!
  const published = await payload.update({
    collection: 'association-pages',
    id: draft.id,
    data: { _status: 'published' },
    overrideAccess: false,
    req: await requestFor(editor, { requestId: `publish-${pageKey}-${runId}` }),
  })
  if (published._status !== 'published' || !published.publishedAt) {
    throw new Error(`${pageKey} did not publish`)
  }
}

const firstContact = await getPublicAssociationPage(
  payload,
  await requestFor(),
  'contact',
)
const firstPublicContact =
  firstContact.pageKey === 'contact' ? firstContact.contacts[0] : undefined
if (
  firstContact.pageKey !== 'contact' ||
  firstPublicContact?.value !== 'association@example.test' ||
  !firstPublicContact ||
  !('href' in firstPublicContact) ||
  firstPublicContact.href !== 'mailto:association@example.test'
) {
  throw new Error('Published contact DTO is invalid')
}

const about = pages.get('about')!
const aboutPublicBefore = await getPublicAssociationPage(
  payload,
  await requestFor(),
  'about',
)
await payload.update({
  collection: 'association-pages',
  id: about.id,
  data: {
    _status: 'draft',
    title: `审计失败不得公开 ${runId}`,
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const [aboutVersionsBefore, aboutAuditsBefore] = await Promise.all([
  payload.countVersions({
    collection: 'association-pages',
    overrideAccess: true,
    where: { parent: { equals: about.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: about.id } },
  }),
])
const auditFailureRequestId = `association-audit-failure-${runId}`
const originalPayloadCreate = payload.create
payload.create = (async (options) => {
  const auditData = options.data as { requestId?: unknown }
  if (
    options.collection === 'audit-events' &&
    auditData.requestId === auditFailureRequestId
  ) {
    throw new Error('intentional association audit failure')
  }
  return originalPayloadCreate.call(payload, options as never)
}) as typeof payload.create
try {
  await payload.update({
    collection: 'association-pages',
    id: about.id,
    data: { _status: 'published' },
    overrideAccess: false,
    req: await requestFor(editor, { requestId: auditFailureRequestId }),
  })
  throw new Error('Publish unexpectedly survived an audit failure')
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'intentional association audit failure'
  ) {
    throw error
  }
} finally {
  payload.create = originalPayloadCreate
}
const [aboutPublicAfter, aboutVersionsAfter, aboutAuditsAfter] =
  await Promise.all([
    getPublicAssociationPage(payload, await requestFor(), 'about'),
    payload.countVersions({
      collection: 'association-pages',
      overrideAccess: true,
      where: { parent: { equals: about.id } },
    }),
    payload.count({
      collection: 'audit-events',
      overrideAccess: true,
      where: { targetId: { equals: about.id } },
    }),
  ])
if (
  aboutPublicAfter.title !== aboutPublicBefore.title ||
  aboutVersionsAfter.totalDocs !== aboutVersionsBefore.totalDocs ||
  aboutAuditsAfter.totalDocs !== aboutAuditsBefore.totalDocs
) {
  throw new Error('Audit failure did not roll back the directed page evidence')
}

await payload.update({
  collection: 'association-pages',
  id: contactDraft.id,
  data: {
    _status: 'draft',
    contacts: contactDraft.contacts?.map((contact) => ({
      ...contact,
      value: 'association-new@example.test',
    })),
    title: '虚构联系方式新版',
  },
  draft: true,
  overrideAccess: false,
  req: await requestFor(editor, { draft: true }),
})
const unchangedContact = await getPublicAssociationPage(
  payload,
  await requestFor(),
  'contact',
)
if (
  unchangedContact.pageKey !== 'contact' ||
  unchangedContact.contacts[0]?.value !== 'association@example.test'
) {
  throw new Error('Saving a newer contact draft changed the public version')
}

await payload.update({
  collection: 'association-pages',
  id: contactDraft.id,
  data: { _status: 'published' },
  overrideAccess: false,
  req: await requestFor(editor, { requestId: `republish-contact-${runId}` }),
})
const revisedContact = await getPublicAssociationPage(
  payload,
  await requestFor(),
  'contact',
)
if (
  revisedContact.pageKey !== 'contact' ||
  revisedContact.contacts[0]?.value !== 'association-new@example.test' ||
  revisedContact.contacts[0]?.contactId !== generatedContact.contactId
) {
  throw new Error('Republished contact value or stable contactId is invalid')
}

const home = pages.get('home')!
const [homeVersionsBefore, homeAuditsBefore] = await Promise.all([
  payload.countVersions({
    collection: 'association-pages',
    overrideAccess: true,
    where: { parent: { equals: home.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: home.id } },
  }),
])
try {
  await payload.update({
    collection: 'association-pages',
    id: home.id,
    data: { _status: 'draft' },
    overrideAccess: false,
    req: await requestFor(editor, { requestId: `unpublish-home-${runId}` }),
  })
  throw new Error('Published home page unexpectedly unpublished')
} catch (error) {
  if (!(error instanceof ValidationError)) throw error
}
const [homeAfter, homeVersionsAfter, homeAuditsAfter] = await Promise.all([
  payload.findByID({
    collection: 'association-pages',
    id: home.id,
    overrideAccess: true,
  }),
  payload.countVersions({
    collection: 'association-pages',
    overrideAccess: true,
    where: { parent: { equals: home.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: home.id } },
  }),
])
if (
  homeAfter._status !== 'published' ||
  homeVersionsAfter.totalDocs !== homeVersionsBefore.totalDocs ||
  homeAuditsAfter.totalDocs !== homeAuditsBefore.totalDocs
) {
  throw new Error('Rejected home unpublish changed database state')
}

const denied = await ensureUser(fixtureUsername('assoc-deny'))
const overrideGrantor = await ensureUser(
  fixtureUsername('assoc-grant'),
  'admin',
)
await payload.create({
  collection: 'permission-overrides',
  data: {
    effect: 'deny',
    grantedAt: '2026-07-13T00:00:00.000Z',
    grantedBy: overrideGrantor.id,
    permission: 'content.directPublish',
    reason: '虚构协会页面集成测试显式拒绝',
    scopeType: 'global',
    user: denied.id,
  },
  overrideAccess: true,
})
const deniedTarget = pages.get('contact')!
const [deniedVersionsBefore, deniedAuditsBefore] = await Promise.all([
  payload.countVersions({
    collection: 'association-pages',
    overrideAccess: true,
    where: { parent: { equals: deniedTarget.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: deniedTarget.id } },
  }),
])
try {
  await payload.update({
    collection: 'association-pages',
    id: deniedTarget.id,
    data: { _status: 'published' },
    overrideAccess: false,
    req: await requestFor(denied),
  })
  throw new Error('Denied editor unexpectedly published')
} catch (error) {
  if (!(error instanceof Forbidden)) throw error
}
const [deniedVersionsAfter, deniedAuditsAfter] = await Promise.all([
  payload.countVersions({
    collection: 'association-pages',
    overrideAccess: true,
    where: { parent: { equals: deniedTarget.id } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: { targetId: { equals: deniedTarget.id } },
  }),
])
if (
  deniedVersionsAfter.totalDocs !== deniedVersionsBefore.totalDocs ||
  deniedAuditsAfter.totalDocs !== deniedAuditsBefore.totalDocs
) {
  throw new Error('Forbidden publish changed versions or audit state')
}

for (const pageKey of ['about', 'contact'] as const) {
  await payload.update({
    collection: 'association-pages',
    id: pages.get(pageKey)!.id,
    data: { _status: 'draft' },
    overrideAccess: false,
    req: await requestFor(editor, {
      requestId: `unpublish-${pageKey}-${runId}`,
    }),
  })
  await expectNotFound(pageKey)
}

payload.logger.info('Association page integration verification passed')
process.exit(0)
