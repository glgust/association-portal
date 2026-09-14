import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import { hashFormSchema } from '../src/modules/recruitment/form-schema/schema-hash'

const payload = await getPayload({ config })

const existingCycle = await payload.find({
  collection: 'recruitment-cycles',
  limit: 1,
  overrideAccess: true,
  where: {
    code: {
      equals: 'demo-2026-m001',
    },
  },
})

if (existingCycle.totalDocs > 0) {
  payload.logger.info('M001 migration fixture already exists')
  process.exit(0)
}

const cycle = await payload.create({
  collection: 'recruitment-cycles',
  data: {
    code: 'demo-2026-m001',
    name: '2026 Demo Recruitment (Fictional)',
    status: 'open',
  },
  overrideAccess: true,
})

const schema = {
  fields: [
    {
      fieldId: 'fullName',
      label: '姓名',
      required: true,
      type: 'text',
    },
    {
      fieldId: 'studentNumber',
      label: '学号',
      required: true,
      type: 'text',
    },
  ],
  schemaVersion: 1,
}

const definition = await payload.create({
  collection: 'form-definitions',
  data: {
    draftSchema: schema,
    name: 'Demo Membership Application',
    recruitmentCycle: cycle.id,
  },
  overrideAccess: true,
})

const formVersion = await payload.create({
  collection: 'form-versions',
  data: {
    formDefinition: definition.id,
    publishedAt: new Date('2026-07-13T00:00:00.000Z').toISOString(),
    recruitmentCycle: cycle.id,
    schema,
    schemaHash: hashFormSchema(schema),
    status: 'published',
    version: 1,
  },
  overrideAccess: true,
})

await payload.create({
  collection: 'membership-applications',
  data: {
    answers: {
      fullName: '测试同学',
      studentNumber: 'DEMO-2026-0001',
    },
    formVersion: formVersion.id,
    idempotencyKey: 'm001-fixture-application',
    recordVersion: 1,
    recruitmentCycle: cycle.id,
    status: 'pending',
    submittedAt: new Date('2026-07-13T00:01:00.000Z').toISOString(),
  },
  overrideAccess: true,
})

payload.logger.info('Created fictional M001 migration fixture')
process.exit(0)
