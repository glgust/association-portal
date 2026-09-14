import 'dotenv/config'

import { createLocalReq, getPayload, type TypedUser } from 'payload'
import sharp from 'sharp'

import config from '../src/payload.config'
import { assertE2EMediaStorageConfig } from '../src/config/media-storage-e2e'
import { readMediaStorageConfig } from '../src/config/media-storage'
import { createObjectStorage } from '../src/modules/media/storage'
import { uploadMediaAsset } from '../src/modules/media/upload'
import type { AssociationPage } from '../src/payload-types'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error('E2E seed may only use local ascnucc_demo_test')
}
const mediaStorageConfig = assertE2EMediaStorageConfig(readMediaStorageConfig())

const payload = await getPayload({ config })

const existingNews = await payload.find({
  collection: 'news',
  overrideAccess: true,
  pagination: false,
  where: { title: { contains: '虚构协会新闻' } },
})
for (const news of existingNews.docs) {
  await payload.delete({
    collection: 'news',
    id: news.id,
    overrideAccess: true,
  })
}

const existingActivities = await payload.find({
  collection: 'activities',
  overrideAccess: true,
  pagination: false,
  where: {
    or: [
      { title: { contains: '虚构星空观测活动' } },
      { title: { contains: '虚构常驻天文交流夜' } },
    ],
  },
})
for (const activity of existingActivities.docs) {
  await payload.delete({
    collection: 'activities',
    id: activity.id,
    overrideAccess: true,
  })
}

const existingAnnouncements = await payload.find({
  collection: 'announcements',
  overrideAccess: true,
  pagination: false,
  where: { title: { contains: '虚构首页公告' } },
})
for (const announcement of existingAnnouncements.docs) {
  await payload.delete({
    collection: 'announcements',
    id: announcement.id,
    overrideAccess: true,
  })
}

const existingAssociationPages = await payload.find({
  collection: 'association-pages',
  limit: 10,
  overrideAccess: true,
  where: {
    or: [
      { title: { equals: '协会门户本地验证首页' } },
      { title: { contains: '虚构 home 页面' } },
      { title: { contains: '虚构 about 页面' } },
      { title: { contains: '虚构 contact 页面' } },
    ],
  },
})
for (const page of existingAssociationPages.docs) {
  await payload.delete({
    collection: 'association-pages',
    id: page.id,
    overrideAccess: true,
  })
}

if (process.env.E2E_CLEAR_CONTENT_ONLY === 'true') {
  await payload.destroy()
  console.info('Exact E2E content fixtures cleared for Admin regression')
  process.exit(0)
}

for (const account of [
  {
    password: 'Local-owner-Only-2026!',
    role: 'owner' as const,
    username: 'e2e-owner',
  },
  {
    password: 'Local-admin-Only-2026!',
    role: 'admin' as const,
    username: 'e2e-admin',
  },
  {
    password: 'Local-staff-Only-2026!',
    role: 'staff' as const,
    username: 'e2e-staff',
  },
  {
    password: 'Local-cadre-Only-2026!',
    role: 'cadre' as const,
    username: 'e2e-cadre',
  },
  {
    password: 'Local-deny-staff-Only-2026!',
    role: 'staff' as const,
    username: 'e2e-deny-staff',
  },
  {
    password: 'Local-member-Only-2026!',
    role: 'member' as const,
    username: 'e2e-member',
  },
]) {
  const existing = await payload.find({
    collection: 'auth-users',
    limit: 1,
    overrideAccess: true,
    where: { username: { equals: account.username } },
  })
  if (existing.totalDocs === 0) {
    await payload.create({
      collection: 'auth-users',
      data: {
        accountType: 'external',
        displayName: `${account.role} E2E user`,
        password: account.password,
        recordVersion: 1,
        role: account.role,
        status: 'active',
        username: account.username,
      },
      overrideAccess: true,
    })
  }
}

for (let index = 1; index <= 51; index += 1) {
  const suffix = String(index).padStart(3, '0')
  const username = `e2e-gallery-author-${suffix}`
  const existing = await payload.find({
    collection: 'auth-users',
    limit: 1,
    overrideAccess: true,
    where: { username: { equals: username } },
  })
  if (existing.totalDocs === 0) {
    await payload.create({
      collection: 'auth-users',
      data: {
        accountType: 'external',
        displayName: `R2 分页候选 ${suffix}`,
        password: `Local-gallery-${suffix}-Only-2026!`,
        recordVersion: 1,
        role: 'member',
        status: 'active',
        username,
      },
      overrideAccess: true,
    })
  }
}

const fixtureAccounts = await payload.find({
  collection: 'auth-users',
  limit: 2,
  overrideAccess: true,
  pagination: false,
  where: { username: { in: ['e2e-owner', 'e2e-admin'] } },
})
const owner = fixtureAccounts.docs.find(
  ({ username }) => username === 'e2e-owner',
)
const admin = fixtureAccounts.docs.find(
  ({ username }) => username === 'e2e-admin',
)
if (!owner || !admin)
  throw new Error('Fictional Gallery fixture accounts are missing')
const ownerId = owner.id
const adminId = admin.id
const denyStaffResult = await payload.find({
  collection: 'auth-users',
  limit: 1,
  overrideAccess: true,
  where: { username: { equals: 'e2e-deny-staff' } },
})
const denyStaff = denyStaffResult.docs[0]
if (!denyStaff) throw new Error('Fictional deny staff account is missing')
const existingCreateDeny = await payload.find({
  collection: 'permission-overrides',
  limit: 1,
  overrideAccess: true,
  where: {
    and: [
      { user: { equals: denyStaff.id } },
      { permission: { equals: 'content.create' } },
      { effect: { equals: 'deny' } },
      { revokedAt: { exists: false } },
    ],
  },
})
if (existingCreateDeny.totalDocs === 0) {
  await payload.create({
    collection: 'permission-overrides',
    data: {
      effect: 'deny',
      grantedAt: new Date().toISOString(),
      grantedBy: ownerId,
      permission: 'content.create',
      reason: '虚构 E2E 媒体上传拒绝矩阵',
      scopeType: 'global',
      user: denyStaff.id,
    },
    overrideAccess: true,
  })
}
const ownerReq = await createLocalReq(
  { user: { ...owner, collection: 'auth-users' } as TypedUser },
  payload,
)
const homeDraftReq = await createLocalReq(
  { user: { ...owner, collection: 'auth-users' } as TypedUser },
  payload,
)
homeDraftReq.query = { draft: true }
const homeBody: AssociationPage['body'] = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: '这里是本地端到端验证使用的虚构首页内容。',
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
const homeDraft = await payload.create({
  collection: 'association-pages',
  data: {
    body: homeBody,
    lead: '使用虚构本地数据核验公开 Web 与 CMS 内容发布闭环。',
    pageKey: 'home',
    seoSummary: 'ASCNUCC 本地端到端验证虚构首页。',
    title: '协会门户本地验证首页',
  },
  draft: true,
  overrideAccess: false,
  req: homeDraftReq,
})
await payload.update({
  collection: 'association-pages',
  data: { _status: 'published' },
  id: homeDraft.id,
  overrideAccess: false,
  req: ownerReq,
})
const storage = createObjectStorage(mediaStorageConfig)

async function ensureGalleryFixture(input: {
  authorId: string
  color: { b: number; g: number; r: number }
  penName?: string
  title: string
}) {
  const existing = await payload.find({
    collection: 'gallery-works',
    depth: 0,
    draft: true,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { title: { equals: input.title } },
  })
  if (existing.docs[0]) return
  const image = await sharp({
    create: {
      background: { ...input.color, alpha: 1 },
      channels: 4,
      height: 180,
      width: 320,
    },
  })
    .png()
    .toBuffer()
  const asset = await uploadMediaAsset({
    actorId: ownerId,
    body: image,
    claimedMimeType: 'image/png',
    logger: (event) => payload.logger.warn(event),
    payload,
    req: ownerReq,
    requestId: `seed-gallery-${input.title}`,
    storage,
  })
  const draftReq = await createLocalReq(
    {
      req: {
        headers: new Headers({
          'x-request-id': `seed-gallery-draft-${asset.id}`,
        }),
      },
      user: { ...owner, collection: 'auth-users' } as TypedUser,
    },
    payload,
  )
  draftReq.query = { draft: true }
  const draft = await payload.create({
    collection: 'gallery-works',
    data: {
      altText: `${input.title}的自制纯色测试图`,
      author: input.authorId,
      displayRightsConfirmed: false,
      media: asset.id,
      penName: input.penName ?? null,
      recognizablePeople: null,
      summary: '仅用于本地端到端验证的自制虚构作品。',
      title: input.title,
    },
    draft: true,
    overrideAccess: false,
    req: draftReq,
  })
  await payload.update({
    collection: 'gallery-works',
    data: {
      _status: 'published',
      displayRightsConfirmed: true,
      recognizablePeople: 'none',
    },
    id: draft.id,
    overrideAccess: false,
    req: ownerReq,
  })
}

await ensureGalleryFixture({
  authorId: ownerId,
  color: { b: 96, g: 36, r: 18 },
  penName: '虚构星野',
  title: 'E2E 虚构星云作品',
})
await ensureGalleryFixture({
  authorId: adminId,
  color: { b: 22, g: 88, r: 42 },
  title: 'E2E 虚构月面作品',
})

payload.logger.info('E2E fictional accounts and content fixtures are ready')
process.exit(0)
