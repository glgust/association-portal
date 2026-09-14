import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { randomUUID } from 'node:crypto'
import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'

import {
  canCreateAssociationPage,
  canEditAssociationPage,
  canReadAssociationPage,
} from '../access'
import {
  auditAssociationPagePublication,
  prepareAssociationPageChange,
} from '../hooks'

const contactFields: NonNullable<CollectionConfig['fields']>[number] = {
  name: 'contacts',
  type: 'array',
  admin: {
    condition: (data) => data.pageKey === 'contact',
    description: '只填写协会获准公开的公共联系方式，不填写成员私人联系方式。',
  },
  fields: [
    {
      name: 'contactId',
      type: 'text',
      admin: { readOnly: true },
      defaultValue: randomUUID,
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      options: [
        { label: '邮箱', value: 'email' },
        { label: '电话', value: 'phone' },
        { label: 'QQ', value: 'qq' },
        { label: '微信', value: 'wechat' },
        { label: '其他纯文本', value: 'other' },
      ],
      required: true,
    },
    { name: 'label', type: 'text', maxLength: 60 },
    { name: 'value', type: 'text', maxLength: 200 },
    { name: 'note', type: 'text', maxLength: 160 },
    {
      name: 'isPublic',
      type: 'checkbox',
      defaultValue: false,
      label: '公开展示',
    },
    {
      name: 'showOnHome',
      type: 'checkbox',
      defaultValue: false,
      label: '在首页展示',
    },
  ],
}

export const AssociationPages: CollectionConfig = {
  slug: 'association-pages',
  access: {
    create: canCreateAssociationPage,
    delete: denyAll,
    read: canReadAssociationPage,
    readVersions: canEditAssociationPage,
    update: canEditAssociationPage,
  },
  admin: {
    components: {
      beforeList: [
        '/modules/admin-experience/ContentListGuidance#ContentListGuidance',
      ],
      views: {
        list: {
          Component:
            '/modules/admin-experience/ContentListView#ContentListView',
        },
      },
    },
    defaultColumns: ['pageKey', 'title', '_status', 'publishedAt', 'updatedAt'],
    description:
      '固定页面会显示在公开 Web 对应位置。先保存草稿并核对正文，再使用现有发布动作公开；首页首次发布后不能下线。点击列表标题进入编辑。',
    group: '内容管理',
    useAsTitle: 'title',
  },
  labels: { plural: '协会页面', singular: '协会页面' },
  disableBulkDelete: true,
  disableBulkEdit: true,
  disableDuplicate: true,
  hooks: {
    afterChange: [auditAssociationPagePublication],
    beforeChange: [prepareAssociationPageChange],
  },
  fields: [
    {
      name: 'pageKey',
      label: '页面类型',
      type: 'select',
      admin: { description: '固定页面身份创建后不可修改。' },
      index: true,
      options: [
        { label: '首页', value: 'home' },
        { label: '关于协会', value: 'about' },
        { label: '联系方式', value: 'contact' },
      ],
      required: true,
      unique: true,
    },
    {
      name: 'title',
      type: 'text',
      label: '标题',
      admin: { description: '显示为公开页面的主标题，也用于后台列表识别。' },
      maxLength: 120,
      required: true,
    },
    {
      name: 'seoSummary',
      type: 'textarea',
      label: '搜索摘要',
      maxLength: 240,
      admin: {
        description: '可公开，用于搜索结果和页面元信息；不代替正文。',
      },
    },
    {
      name: 'lead',
      label: '首页引导语',
      type: 'textarea',
      maxLength: 240,
      admin: {
        condition: (data) => data.pageKey === 'home',
        description: '仅首页显示的简短引导语。',
      },
    },
    {
      name: 'body',
      label: '正文',
      type: 'richText',
      editor: lexicalEditor({
        features: [
          ParagraphFeature(),
          HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
          OrderedListFeature(),
          UnorderedListFeature(),
          BlockquoteFeature(),
          LinkFeature({ disableAutoLinks: true, enabledCollections: [] }),
          BoldFeature(),
          ItalicFeature(),
          UnderlineFeature(),
          InlineCodeFeature(),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
      required: true,
      admin: { description: '公开页面的主要内容。' },
    },
    contactFields,
    {
      name: 'publishedAt',
      label: '发布时间',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      index: true,
    },
    {
      name: 'createdBy',
      label: '创建人',
      type: 'relationship',
      relationTo: 'auth-users',
      required: true,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
    },
    {
      name: 'lastEditedBy',
      label: '最后编辑人',
      type: 'relationship',
      relationTo: 'auth-users',
      required: true,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
    },
  ],
  versions: {
    drafts: { schedulePublish: false, validate: false },
    maxPerDoc: 50,
  },
}
