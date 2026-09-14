import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import { hashFormSchema } from '../src/modules/recruitment/form-schema/schema-hash'

const payload = await getPayload({ config })
const applications = await payload.find({
  collection: 'membership-applications',
  depth: 0,
  limit: 1,
  overrideAccess: true,
  where: {
    idempotencyKey: {
      equals: 'm001-fixture-application',
    },
  },
})

if (applications.totalDocs !== 1) {
  throw new Error('Expected exactly one M001 fixture application after M002')
}

const application = applications.docs[0]
const formVersionId =
  typeof application.formVersion === 'string'
    ? application.formVersion
    : application.formVersion.id
const formVersion = await payload.findByID({
  collection: 'form-versions',
  id: formVersionId,
  overrideAccess: true,
})

if (formVersion.schemaHash !== hashFormSchema(formVersion.schema)) {
  throw new Error(
    'M002 schemaHash backfill does not match the runtime hash algorithm',
  )
}

const answers = application.answers as Record<string, unknown>
if (
  answers.fullName !== '测试同学' ||
  answers.studentNumber !== 'DEMO-2026-0001'
) {
  throw new Error('M001 historical answers changed during M002')
}

payload.logger.info(
  `Verified M001→M002 fixture: application=${application.id}, formVersion=${formVersion.id}`,
)
process.exit(0)
