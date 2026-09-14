import type { CollectionConfig } from 'payload'

import { isAuthenticatedNonMember } from '@/access/is-authenticated-non-member'

export const DemoPages: CollectionConfig = {
  slug: 'demo-pages',
  access: {
    create: isAuthenticatedNonMember,
    delete: isAuthenticatedNonMember,
    read: () => true,
    update: isAuthenticatedNonMember,
  },
  admin: {
    description:
      '仅供演示和工程调试，不是正式会员身份核验或账号申领入口；不得录入真实个人资料。',
    group: '历史与 Demo',
    useAsTitle: 'title',
  },
  labels: { plural: 'Demo 页面', singular: 'Demo 页面' },
  fields: [
    {
      name: 'title',
      label: '标题',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      label: '路径标识',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'summary',
      label: '摘要',
      type: 'textarea',
    },
  ],
}
