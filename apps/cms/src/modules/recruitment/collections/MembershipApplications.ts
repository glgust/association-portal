import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'
import { canReadMembershipApplication } from '@/modules/recruitment/access'
import { membershipApplicationStatuses } from '@/modules/recruitment/domain'
import {
  allowsRecruitmentOperation,
  recruitmentBusinessOperations,
} from '@/modules/recruitment/business-context'

export const MembershipApplications: CollectionConfig = {
  slug: 'membership-applications',
  access: {
    create: allowsRecruitmentOperation(
      recruitmentBusinessOperations.submitApplication,
    ),
    delete: denyAll,
    read: canReadMembershipApplication,
    update: allowsRecruitmentOperation(
      recruitmentBusinessOperations.approveApplication,
    ),
  },
  admin: {
    description:
      '历史招新申请，仅供演示和工程调试；不是当前会员账号申领入口，不得录入真实个人资料。',
    group: '历史与 Demo',
    useAsTitle: 'id',
  },
  labels: { plural: '历史招新申请', singular: '招新申请' },
  fields: [
    {
      name: 'recruitmentCycle',
      type: 'relationship',
      index: true,
      relationTo: 'recruitment-cycles',
      required: true,
    },
    {
      name: 'formVersion',
      type: 'relationship',
      index: true,
      relationTo: 'form-versions',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      index: true,
      options: [...membershipApplicationStatuses],
      required: true,
    },
    { name: 'answers', type: 'json', required: true },
    {
      name: 'idempotencyKey',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'recordVersion',
      type: 'number',
      defaultValue: 1,
      min: 1,
      required: true,
    },
    { name: 'submittedAt', type: 'date', required: true },
  ],
}
