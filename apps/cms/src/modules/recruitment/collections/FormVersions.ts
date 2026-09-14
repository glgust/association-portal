import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'
import { isAuthenticatedNonMemberRequest } from '@/access/is-authenticated-non-member'
import { formVersionStatuses } from '@/modules/recruitment/domain'
import {
  allowsRecruitmentOperation,
  recruitmentBusinessOperations,
} from '@/modules/recruitment/business-context'
import {
  preventFormVersionDelete,
  protectFormVersion,
} from '@/modules/recruitment/form-schema/hooks'

export const FormVersions: CollectionConfig = {
  slug: 'form-versions',
  access: {
    create: allowsRecruitmentOperation(
      recruitmentBusinessOperations.publishForm,
    ),
    delete: denyAll,
    read: ({ req }) =>
      isAuthenticatedNonMemberRequest(req)
        ? true
        : {
            status: {
              equals: 'published',
            },
          },
    update: denyAll,
  },
  admin: {
    group: false,
    useAsTitle: 'version',
  },
  labels: { plural: '表单版本快照', singular: '表单版本快照' },
  hooks: {
    beforeChange: [protectFormVersion],
    beforeDelete: [preventFormVersionDelete],
  },
  fields: [
    {
      name: 'formDefinition',
      type: 'relationship',
      index: true,
      relationTo: 'form-definitions',
      required: true,
    },
    {
      name: 'recruitmentCycle',
      type: 'relationship',
      index: true,
      relationTo: 'recruitment-cycles',
      required: true,
    },
    { name: 'version', type: 'number', min: 1, required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'published',
      options: [...formVersionStatuses],
      required: true,
    },
    { name: 'schema', type: 'json', required: true },
    { name: 'schemaHash', type: 'text', index: true, required: true },
    { name: 'publishedAt', type: 'date', required: true },
  ],
  indexes: [
    {
      fields: ['formDefinition', 'version'],
      unique: true,
    },
  ],
}
