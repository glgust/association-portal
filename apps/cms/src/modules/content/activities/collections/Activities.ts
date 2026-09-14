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
import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'
import {
  canCreateActivity,
  canEditActivity,
  canReadActivity,
} from '@/modules/content/activities/access'
import {
  auditActivityPublication,
  prepareActivityChange,
} from '@/modules/content/activities/hooks'

export const Activities: CollectionConfig = {
  slug: 'activities',
  access: {
    create: canCreateActivity,
    delete: denyAll,
    read: canReadActivity,
    readVersions: canEditActivity,
    update: canEditActivity,
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
    defaultColumns: ['title', 'activityType', '_status', 'publishedAt'],
    description:
      '活动发布后出现在公开活动目录及详情页。先保存草稿并核对介绍，再使用现有发布动作公开；取消会保留公开说明，Unpublish 才会移除。点击列表标题进入编辑。',
    group: '内容管理',
    useAsTitle: 'title',
  },
  defaultSort: '-publishedAt',
  disableBulkDelete: true,
  disableBulkEdit: true,
  disableDuplicate: true,
  hooks: {
    afterChange: [auditActivityPublication],
    beforeChange: [prepareActivityChange],
  },
  labels: { plural: '活动目录', singular: '活动' },
  fields: [
    {
      name: 'activityType',
      type: 'select',
      label: '活动类型',
      options: [
        { label: '临时活动', value: 'temporary' },
        { label: '常驻活动', value: 'standing' },
      ],
      required: true,
    },
    {
      name: 'title',
      type: 'text',
      label: '标题',
      admin: { description: '显示在公开活动目录和活动详情页顶部。' },
      maxLength: 120,
      required: true,
    },
    {
      name: 'summary',
      type: 'textarea',
      label: '公开摘要',
      maxLength: 240,
      admin: {
        description: '可公开，供活动目录快速了解内容；不代替活动介绍。',
      },
    },
    {
      name: 'slug',
      type: 'text',
      admin: {
        description: '创建时由服务端生成，后续不可修改。',
        readOnly: true,
      },
      index: true,
      label: '公开路径标识',
      required: true,
      unique: true,
    },
    {
      name: 'location',
      type: 'text',
      admin: { description: '只填写纯文本地点，不填写地图或链接。' },
      label: '地点',
      maxLength: 200,
    },
    {
      name: 'startsAt',
      type: 'date',
      admin: {
        condition: (_, siblingData) => siblingData.activityType === 'temporary',
        date: {
          displayFormat: 'yyyy-MM-dd HH:mm',
          pickerAppearance: 'dayAndTime',
          timeFormat: 'HH:mm',
        },
        description: '临时活动发布时必填。',
      },
      label: '开始时间',
    },
    {
      name: 'endsAt',
      type: 'date',
      admin: {
        condition: (_, siblingData) => siblingData.activityType === 'temporary',
        date: {
          displayFormat: 'yyyy-MM-dd HH:mm',
          pickerAppearance: 'dayAndTime',
          timeFormat: 'HH:mm',
        },
        description: '临时活动发布时必填，且必须晚于开始时间。',
      },
      label: '结束时间',
    },
    {
      name: 'scheduleText',
      type: 'textarea',
      admin: {
        condition: (_, siblingData) => siblingData.activityType === 'standing',
        description: '常驻活动发布时必填，例如“每周五 19:30–21:00”。',
      },
      label: '开放时间说明',
      maxLength: 240,
    },
    {
      name: 'isCancelled',
      type: 'checkbox',
      admin: {
        description: '取消后活动仍公开；如需移除请使用 Unpublish 下线。',
      },
      defaultValue: false,
      label: '已取消',
      required: true,
    },
    {
      name: 'cancellationNote',
      type: 'textarea',
      admin: {
        condition: (_, siblingData) => siblingData.isCancelled === true,
        description: '取消版本发布时必填，将向访客公开。',
      },
      label: '取消说明',
      maxLength: 500,
    },
    {
      name: 'body',
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
      label: '活动介绍',
      admin: { description: '活动详情页公开展示的主要内容。' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      index: true,
      label: '当前公开版本发布时间',
    },
    {
      name: 'historySortAt',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: { hidden: true, readOnly: true },
      index: true,
      label: '历史排序时间（内部）',
    },
    {
      name: 'createdBy',
      type: 'relationship',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      label: '创建者',
      relationTo: 'auth-users',
      required: true,
    },
    {
      name: 'lastEditedBy',
      type: 'relationship',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      label: '最后编辑者',
      relationTo: 'auth-users',
      required: true,
    },
  ],
  versions: {
    drafts: { schedulePublish: false, validate: false },
    maxPerDoc: 50,
  },
}
