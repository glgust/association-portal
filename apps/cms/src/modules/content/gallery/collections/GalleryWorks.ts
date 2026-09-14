import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'
import {
  canCreateGalleryWork,
  canEditGalleryWork,
  canReadGalleryWork,
} from '@/modules/content/gallery/access'
import {
  auditGalleryPublication,
  prepareGalleryChange,
} from '@/modules/content/gallery/hooks'

export const GalleryWorks: CollectionConfig = {
  slug: 'gallery-works',
  access: {
    create: canCreateGalleryWork,
    delete: denyAll,
    read: canReadGalleryWork,
    readVersions: canEditGalleryWork,
    update: canEditGalleryWork,
  },
  admin: {
    defaultColumns: ['title', '_status', 'publishedAt', 'updatedAt'],
    description:
      '单图协会作品。上传只接受 JPEG、静态 PNG/WebP，原件不保留；公开署名优先笔名，否则回退作者显示名。保存草稿不会改变当前公开版本；发布前须确认展示权利与人物授权。下线会关闭匿名入口，但无法召回访客已下载的副本。',
    group: '内容管理',
    useAsTitle: 'title',
  },
  defaultSort: '-publishedAt',
  disableBulkDelete: true,
  disableBulkEdit: true,
  disableDuplicate: true,
  hooks: {
    afterChange: [auditGalleryPublication],
    beforeChange: [prepareGalleryChange],
  },
  labels: { plural: '协会画廊', singular: '画廊作品' },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: '作品标题',
      maxLength: 120,
      required: true,
    },
    {
      name: 'summary',
      type: 'textarea',
      label: '公开摘要',
      maxLength: 240,
    },
    {
      name: 'slug',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      index: true,
      label: '公开路径标识',
      required: true,
      unique: true,
    },
    {
      name: 'media',
      type: 'relationship',
      label: '媒体资产',
      relationTo: 'media-assets',
      required: true,
    },
    {
      name: 'altText',
      type: 'textarea',
      label: '替代文本',
      maxLength: 240,
      required: true,
    },
    {
      name: 'author',
      type: 'relationship',
      admin: {
        components: {
          Field:
            '/modules/content/gallery/admin/GalleryAuthorField#GalleryAuthorField',
        },
        description:
          '默认当前操作者。只有账号管理员可经画廊作者候选入口选择其他账号。',
      },
      label: '内部作者追溯',
      relationTo: 'auth-users',
      required: true,
    },
    {
      name: 'penName',
      type: 'text',
      label: '公开笔名（可选）',
      maxLength: 100,
    },
    {
      name: 'publicAuthorName',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      label: '当前公开署名快照',
    },
    {
      name: 'displayRightsConfirmed',
      type: 'checkbox',
      defaultValue: false,
      label: '已确认作品展示权利',
      required: true,
    },
    {
      name: 'recognizablePeople',
      type: 'select',
      label: '可识别人像',
      options: [
        { label: '无可识别人像', value: 'none' },
        { label: '已确认人物同意', value: 'consentConfirmed' },
      ],
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
