import 'dotenv/config'

import { createLocalReq, getPayload, type TypedUser } from 'payload'

import config from '../src/payload.config'
import { publishFormDefinition } from '../src/modules/recruitment/use-cases/publish-form-definition'
import type { AssociationPage } from '../src/payload-types'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const databaseUrl = new URL(required('DATABASE_URL'))
const managedContainerSeed =
  process.env.ASCNUCC_DEPLOYMENT_DEMO_SEED === 'true' &&
  process.env.ASCNUCC_ENVIRONMENT === 'demo' &&
  databaseUrl.hostname === 'postgres'
if (
  databaseUrl.pathname !== '/ascnucc_demo_dev' ||
  (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) &&
    !managedContainerSeed)
) {
  throw new Error(
    'Demo seed may only use local ascnucc_demo_dev or the managed deployment demo database',
  )
}

const payload = await getPayload({ config })

type DemoRole = 'cadre' | 'owner' | 'staff'

async function ensureAccount(input: {
  displayName: string
  password: string
  role: DemoRole
  username: string
}) {
  const existing = await payload.find({
    collection: 'auth-users',
    limit: 1,
    overrideAccess: true,
    where: { username: { equals: input.username } },
  })

  if (existing.docs[0]) {
    return payload.update({
      collection: 'auth-users',
      data: {
        ...input,
        accountType: 'external',
        recordVersion: 1,
        status: 'active',
      },
      id: existing.docs[0].id,
      overrideAccess: true,
    })
  }

  return payload.create({
    collection: 'auth-users',
    data: {
      ...input,
      accountType: 'external',
      recordVersion: 1,
      status: 'active',
    },
    overrideAccess: true,
  })
}

const [owner] = await Promise.all([
  ensureAccount({
    displayName: 'Demo Owner',
    password: required('DEMO_ADMIN_PASSWORD'),
    role: 'owner',
    username: required('DEMO_ADMIN_USERNAME'),
  }),
  ensureAccount({
    displayName: 'Demo Staff',
    password: required('DEMO_STAFF_PASSWORD'),
    role: 'staff',
    username: required('DEMO_STAFF_USERNAME'),
  }),
  ensureAccount({
    displayName: 'Demo Cadre',
    password: required('DEMO_CADRE_PASSWORD'),
    role: 'cadre',
    username: required('DEMO_CADRE_USERNAME'),
  }),
])

const ownerReq = await createLocalReq(
  { user: { ...owner, collection: 'auth-users' } as TypedUser },
  payload,
)

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
            text: '欢迎访问示例协会网站。',
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

const existingHome = await payload.find({
  collection: 'association-pages',
  draft: true,
  limit: 1,
  overrideAccess: true,
  pagination: false,
  where: { pageKey: { equals: 'home' } },
})
const homeData = {
  body: homeBody,
  lead: '探索星空，分享观测与天文知识。',
  pageKey: 'home' as const,
  seoSummary: '示例协会网站，提供协会动态、活动、公告、作品与联系方式。',
  title: '示例协会',
}
if (existingHome.docs[0]) {
  await payload.update({
    collection: 'association-pages',
    data: { ...homeData, _status: 'published' },
    id: existingHome.docs[0].id,
    overrideAccess: false,
    req: ownerReq,
  })
} else {
  const homeDraft = await payload.create({
    collection: 'association-pages',
    data: homeData,
    draft: true,
    overrideAccess: false,
    req: ownerReq,
  })
  await payload.update({
    collection: 'association-pages',
    data: { _status: 'published' },
    id: homeDraft.id,
    overrideAccess: false,
    req: ownerReq,
  })
}

const cycleCode = 'local-demo-recruitment'
const existingCycle = await payload.find({
  collection: 'recruitment-cycles',
  limit: 1,
  overrideAccess: true,
  where: { code: { equals: cycleCode } },
})
const cycle = existingCycle.docs[0]
  ? await payload.update({
      collection: 'recruitment-cycles',
      data: { status: 'open' },
      id: existingCycle.docs[0].id,
      overrideAccess: true,
    })
  : await payload.create({
      collection: 'recruitment-cycles',
      data: {
        code: cycleCode,
        name: '本地 Demo 招新（全部为虚构数据）',
        status: 'open',
      },
      overrideAccess: true,
    })

const schema = {
  fields: [
    { fieldId: 'fullName', label: '姓名', required: true, type: 'text' },
    {
      fieldId: 'studentNumber',
      label: '学号',
      required: true,
      type: 'text',
    },
    {
      fieldId: 'interest',
      label: '兴趣方向',
      options: [
        { label: '天文观测', optionId: 'observing' },
        { label: '天文摄影', optionId: 'photography' },
      ],
      required: false,
      type: 'select',
    },
    {
      fieldId: 'introduction',
      label: '虚构的个人介绍',
      required: false,
      type: 'textarea',
    },
  ],
  schemaVersion: 1,
} as const

const existingDefinition = await payload.find({
  collection: 'form-definitions',
  limit: 1,
  overrideAccess: true,
  where: { recruitmentCycle: { equals: cycle.id } },
})
const definition = existingDefinition.docs[0]
  ? existingDefinition.docs[0]
  : await payload.create({
      collection: 'form-definitions',
      data: {
        draftSchema: schema,
        name: '本地 Demo 入会申请表',
        recruitmentCycle: cycle.id,
      },
      overrideAccess: true,
    })

const existingVersion = await payload.find({
  collection: 'form-versions',
  limit: 1,
  overrideAccess: true,
  sort: '-version',
  where: {
    and: [
      { formDefinition: { equals: definition.id } },
      { status: { equals: 'published' } },
    ],
  },
})
if (!existingVersion.docs[0]) {
  await publishFormDefinition(
    payload,
    await createLocalReq(
      { user: { ...owner, collection: 'auth-users' } as TypedUser },
      payload,
    ),
    definition.id,
    new Date(),
  )
}

const existingPage = await payload.find({
  collection: 'demo-pages',
  limit: 1,
  overrideAccess: true,
  where: { slug: { equals: 'local-demo' } },
})
if (!existingPage.docs[0]) {
  await payload.create({
    collection: 'demo-pages',
    data: {
      slug: 'local-demo',
      summary: '用于验证 Payload 标准 Collection 页面。',
      title: '本地架构验收 Demo',
    },
    overrideAccess: true,
  })
}

payload.logger.info(
  `Local fictional Demo is ready; recruitmentCycleId=${cycle.id}`,
)
process.exit(0)
