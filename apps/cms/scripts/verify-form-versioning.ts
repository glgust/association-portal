import 'dotenv/config'

import { createLocalReq, getPayload, type TypedUser } from 'payload'

import config from '../src/payload.config'
import { hashFormSchema } from '../src/modules/recruitment/form-schema/schema-hash'
import { publishFormDefinition } from '../src/modules/recruitment/use-cases/publish-form-definition'
import { BusinessError } from '../src/modules/shared/business-error'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Form-version integration test may only use local ascnucc_demo_test',
  )
}

const payload = await getPayload({ config })
const definition = (
  await payload.find({
    collection: 'form-definitions',
    limit: 1,
    overrideAccess: true,
    where: { name: { equals: 'Demo Membership Application' } },
  })
).docs[0]
if (!definition)
  throw new Error('Run seed:migration-fixture before the form-version test')

const previous = (
  await payload.find({
    collection: 'form-versions',
    limit: 1,
    overrideAccess: true,
    sort: '-version',
    where: { formDefinition: { equals: definition.id } },
  })
).docs[0]
if (!previous) throw new Error('Expected an existing published version')
const previousSnapshot = JSON.stringify(previous.schema)

const nextSchema = {
  fields: [
    {
      fieldId: 'fullName',
      label: `姓名（版本 ${previous.version + 1}）`,
      required: true,
      type: 'text',
    },
    { fieldId: 'studentNumber', label: '学号', required: true, type: 'text' },
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
  ],
  schemaVersion: 1,
}
await payload.update({
  collection: 'form-definitions',
  id: definition.id,
  data: { draftSchema: nextSchema },
  overrideAccess: true,
})

async function user(username: string): Promise<TypedUser> {
  const found = await payload.find({
    collection: 'auth-users',
    limit: 1,
    overrideAccess: true,
    where: { username: { equals: username } },
  })
  if (!found.docs[0]) throw new Error(`Missing integration user: ${username}`)
  return { ...found.docs[0], collection: 'auth-users' } as TypedUser
}

try {
  await publishFormDefinition(
    payload,
    await createLocalReq({ user: await user('integration-staff') }, payload),
    definition.id,
    new Date('2026-07-13T12:30:00.000Z'),
  )
  throw new Error('Staff unexpectedly published a form version')
} catch (error) {
  if (!(error instanceof BusinessError) || error.code !== 'FORBIDDEN')
    throw error
}

const published = await publishFormDefinition(
  payload,
  await createLocalReq({ user: await user('integration-admin') }, payload),
  definition.id,
  new Date('2026-07-13T12:31:00.000Z'),
)
if (
  published.version !== previous.version + 1 ||
  published.schemaHash !== hashFormSchema(published.schema)
) {
  throw new Error('Published version or schema hash is incorrect')
}

const unchanged = await payload.findByID({
  collection: 'form-versions',
  id: previous.id,
  overrideAccess: true,
})
if (JSON.stringify(unchanged.schema) !== previousSnapshot) {
  throw new Error('Publishing vNext changed the previous FormVersion snapshot')
}

for (const mutation of [
  () =>
    payload.update({
      collection: 'form-versions',
      id: published.id,
      data: { schemaHash: '0'.repeat(64) },
      overrideAccess: true,
    }),
  () =>
    payload.delete({
      collection: 'form-versions',
      id: published.id,
      overrideAccess: true,
    }),
]) {
  try {
    await mutation()
    throw new Error('Published FormVersion mutation unexpectedly succeeded')
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/immutable|cannot be deleted/.test(error.message)
    )
      throw error
  }
}

payload.logger.info(
  `Form versioning passed: v${previous.version} immutable, v${published.version} published by admin`,
)
process.exit(0)
