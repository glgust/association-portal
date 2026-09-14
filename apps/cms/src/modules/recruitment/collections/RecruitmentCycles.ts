import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'
import { isAuthenticatedNonMember } from '@/access/is-authenticated-non-member'
import { recruitmentCycleStatuses } from '@/modules/recruitment/domain'

export const RecruitmentCycles: CollectionConfig = {
  slug: 'recruitment-cycles',
  access: {
    create: denyAll,
    delete: denyAll,
    read: isAuthenticatedNonMember,
    update: denyAll,
  },
  admin: {
    description: '历史招新届次，仅供演示和工程调试；不得录入真实个人资料。',
    group: '历史与 Demo',
    useAsTitle: 'name',
  },
  labels: { plural: '历史招新届次', singular: '招新届次' },
  fields: [
    { name: 'code', type: 'text', index: true, required: true, unique: true },
    { name: 'name', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [...recruitmentCycleStatuses],
      required: true,
    },
    { name: 'opensAt', type: 'date' },
    { name: 'closesAt', type: 'date' },
  ],
}
