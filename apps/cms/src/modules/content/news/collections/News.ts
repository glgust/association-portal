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
  canCreateNews,
  canEditNews,
  canReadNews,
} from '@/modules/content/news/access'
import {
  auditNewsPublication,
  prepareNewsChange,
} from '@/modules/content/news/hooks'

export const News: CollectionConfig = {
  slug: 'news',
  access: {
    create: canCreateNews,
    delete: denyAll,
    read: canReadNews,
    readVersions: canEditNews,
    update: canEditNews,
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
      '新闻发布后出现在公开新闻列表及详情页。保存草稿或新版草稿不会改变当前公开版本；公开新版本使用现有发布动作，下线使用 Unpublish。点击列表标题进入编辑。',
    group: '内容管理',
    useAsTitle: 'title',
  },
  defaultSort: '-publishedAt',
  disableBulkDelete: true,
  disableBulkEdit: true,
  disableDuplicate: true,
  hooks: {
    afterChange: [auditNewsPublication],
    beforeChange: [prepareNewsChange],
  },
  labels: { plural: '新闻', singular: '新闻' },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: '标题',
      admin: { description: '显示在公开新闻列表和新闻详情页顶部。' },
      maxLength: 120,
      required: true,
    },
    {
      name: 'summary',
      type: 'textarea',
      admin: {
        description:
          '可公开，供新闻列表快速了解内容；只填写单行纯文本，不代替正文。',
      },
      label: '公开摘要',
      maxLength: 240,
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
      label: '正文',
      admin: { description: '新闻详情页公开展示的主要内容。' },
      required: true,
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
