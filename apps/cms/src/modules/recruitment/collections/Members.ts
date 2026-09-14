import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'
import { canReadMember } from '@/modules/recruitment/access'
import { recruitmentBusinessOperations } from '@/modules/recruitment/business-context'
import {
  allowsMemberAccountClaimOperation,
  memberAccountClaimOperations,
} from '@/modules/recruitment/member-account-claim/business-context'
import {
  memberSources,
  membershipIdentities,
} from '@/modules/recruitment/member-account-claim/domain'
import { contactFields } from '@/modules/recruitment/member-account-claim/collections/contact-fields'

const canCreateMember: NonNullable<CollectionConfig['access']>['create'] = ({
  req,
}) =>
  req.context.recruitmentBusinessOperation ===
    recruitmentBusinessOperations.approveApplication ||
  [
    memberAccountClaimOperations.createMember,
    memberAccountClaimOperations.approveIntake,
    memberAccountClaimOperations.preconfigureClaim,
  ].includes(req.context.memberAccountClaimOperation as never)

export const Members: CollectionConfig = {
  slug: 'members',
  access: {
    create: canCreateMember,
    delete: denyAll,
    read: canReadMember,
    update: allowsMemberAccountClaimOperation(
      memberAccountClaimOperations.approveClaim,
      memberAccountClaimOperations.approveIntake,
      memberAccountClaimOperations.preconfigureClaim,
    ),
  },
  admin: {
    description: '正式会员档案；账号创建与会员认领请使用受控业务页面。',
    group: '会员与账号',
    useAsTitle: 'name',
  },
  labels: { plural: '会员档案', singular: '会员档案' },
  fields: [
    {
      name: 'studentNumber',
      label: '学号',
      type: 'text',
      index: true,
      unique: true,
    },
    { name: 'name', type: 'text', label: '姓名', required: true },
    {
      name: 'membershipIdentity',
      label: '会员身份',
      type: 'select',
      options: [...membershipIdentities],
    },
    contactFields,
    { name: 'major', type: 'text', label: '专业', maxLength: 120 },
    {
      name: 'source',
      type: 'select',
      label: '档案来源',
      options: [...memberSources],
    },
    {
      name: 'sourceApplication',
      label: '来源申请',
      type: 'relationship',
      index: true,
      relationTo: 'membership-applications',
      unique: true,
    },
    {
      name: 'authUser',
      label: '关联账号',
      type: 'relationship',
      index: true,
      relationTo: 'auth-users',
      unique: true,
    },
    {
      name: 'recordVersion',
      type: 'number',
      defaultValue: 1,
      min: 1,
      required: true,
    },
    { name: 'confirmedAt', type: 'date', required: true },
  ],
}
