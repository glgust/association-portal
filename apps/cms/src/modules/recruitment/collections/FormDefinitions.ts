import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'
import { isAuthenticatedNonMember } from '@/access/is-authenticated-non-member'
import { validateDraftSchema } from '@/modules/recruitment/form-schema/hooks'

export const FormDefinitions: CollectionConfig = {
  slug: 'form-definitions',
  access: {
    create: denyAll,
    delete: denyAll,
    read: isAuthenticatedNonMember,
    update: denyAll,
  },
  admin: {
    description: '历史动态表单定义，仅供演示和工程调试；不得录入真实个人资料。',
    group: '历史与 Demo',
    useAsTitle: 'name',
  },
  labels: { plural: '历史表单定义', singular: '表单定义' },
  hooks: {
    beforeChange: [validateDraftSchema],
  },
  fields: [
    {
      name: 'recruitmentCycle',
      type: 'relationship',
      index: true,
      relationTo: 'recruitment-cycles',
      required: true,
    },
    { name: 'name', type: 'text', required: true },
    {
      name: 'draftSchema',
      type: 'json',
      admin: {
        description: '仅草稿可编辑；发布会创建不可变的表单版本快照。',
      },
      required: true,
    },
  ],
}
