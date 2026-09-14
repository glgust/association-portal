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
  canCreateAnnouncement,
  canEditAnnouncement,
  canReadAnnouncement,
} from '@/modules/content/announcements/access'
import {
  auditAnnouncementPublication,
  prepareAnnouncementChange,
} from '@/modules/content/announcements/hooks'

export const Announcements: CollectionConfig = {
  slug: 'announcements',
  access: {
    create: canCreateAnnouncement,
    delete: denyAll,
    read: canReadAnnouncement,
    readVersions: canEditAnnouncement,
    update: canEditAnnouncement,
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
    defaultColumns: ['title', '_status', 'publishedAt', 'updatedAt'],
    description:
      '公告发布后出现在公开公告列表及详情页。先保存草稿并核对正文，再使用现有发布动作公开；Unpublish 会从公开列表移除。点击列表标题进入编辑。',
    group: '内容管理',
    useAsTitle: 'title',
  },
  labels: { plural: '公告', singular: '公告' },
  defaultSort: '-publishedAt',
  disableBulkDelete: true,
  disableBulkEdit: true,
  disableDuplicate: true,
  hooks: {
    afterChange: [auditAnnouncementPublication],
    beforeChange: [prepareAnnouncementChange],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: '标题',
      admin: { description: '显示在公开公告列表和公告详情页顶部。' },
      maxLength: 120,
      required: true,
    },
    {
      name: 'summary',
      type: 'textarea',
      label: '公开摘要',
      maxLength: 240,
      admin: { description: '可公开，供公告列表快速了解内容；不代替正文。' },
    },
    {
      name: 'slug',
      label: '公开路径标识',
      type: 'text',
      admin: { readOnly: true },
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'body',
      label: '正文',
      type: 'richText',
      admin: { description: '公告详情页公开展示的主要内容。' },
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
    },
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
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      relationTo: 'auth-users',
      required: true,
    },
    {
      name: 'lastEditedBy',
      label: '最后编辑人',
      type: 'relationship',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      relationTo: 'auth-users',
      required: true,
    },
  ],
  versions: {
    drafts: { schedulePublish: false, validate: false },
    maxPerDoc: 50,
  },
}
