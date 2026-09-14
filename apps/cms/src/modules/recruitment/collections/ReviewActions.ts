import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'
import { canReadReviewAction } from '@/modules/recruitment/access'
import { reviewActions } from '@/modules/recruitment/domain'
import {
  allowsRecruitmentOperation,
  recruitmentBusinessOperations,
} from '@/modules/recruitment/business-context'

export const ReviewActions: CollectionConfig = {
  slug: 'review-actions',
  admin: { group: false },
  labels: { plural: '审核动作记录', singular: '审核动作记录' },
  access: {
    create: allowsRecruitmentOperation(
      recruitmentBusinessOperations.approveApplication,
    ),
    delete: denyAll,
    read: canReadReviewAction,
    update: denyAll,
  },
  fields: [
    {
      name: 'application',
      type: 'relationship',
      index: true,
      relationTo: 'membership-applications',
      required: true,
      unique: true,
    },
    {
      name: 'reviewer',
      type: 'relationship',
      relationTo: 'auth-users',
      required: true,
    },
    {
      name: 'action',
      type: 'select',
      options: [...reviewActions],
      required: true,
    },
    { name: 'comment', type: 'textarea' },
    { name: 'actedAt', type: 'date', required: true },
  ],
}
