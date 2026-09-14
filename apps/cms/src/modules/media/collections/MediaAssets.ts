import type { CollectionConfig, Field } from 'payload'

import { denyAll } from '@/access/deny-all'
import { canCreateMediaAsset, canReadMediaAsset } from '@/modules/media/access'

const variantFields: Field[] = [
  { name: 'objectKey', type: 'text', required: true, admin: { hidden: true } },
  { name: 'sha256', type: 'text', required: true },
  { name: 'mimeType', type: 'text', required: true },
  { name: 'width', type: 'number', required: true },
  { name: 'height', type: 'number', required: true },
  { name: 'byteSize', type: 'number', required: true },
]

export const MediaAssets: CollectionConfig = {
  slug: 'media-assets',
  access: {
    create: canCreateMediaAsset,
    delete: denyAll,
    read: canReadMediaAsset,
    update: denyAll,
  },
  admin: {
    defaultColumns: ['id', 'width', 'height', 'byteSize', 'createdAt'],
    description:
      '仅保存已完成安全处理的站点图片。原始上传不会保留；资产不可替换或删除。对象 key 不公开。',
    group: '内容管理',
    useAsTitle: 'id',
  },
  disableBulkDelete: true,
  disableBulkEdit: true,
  disableDuplicate: true,
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        if (
          operation !== 'create' ||
          req.context.mediaAssetCreate !== true ||
          typeof req.context.mediaAssetCreateActorId !== 'string'
        ) {
          throw new Error(
            'MediaAsset rows can only be created by the controlled upload use case',
          )
        }
        data.createdBy = req.context.mediaAssetCreateActorId
        return data
      },
    ],
  },
  labels: { plural: '媒体资产', singular: '媒体资产' },
  fields: [
    {
      name: 'objectPrefix',
      type: 'text',
      unique: true,
      required: true,
      admin: { hidden: true },
    },
    { name: 'sha256', type: 'text', required: true },
    { name: 'mimeType', type: 'text', required: true },
    { name: 'width', type: 'number', required: true },
    { name: 'height', type: 'number', required: true },
    { name: 'byteSize', type: 'number', required: true },
    ...(['display', 'detail', 'list', 'thumbnail'] as const).map(
      (name): Field => ({ name, type: 'group', fields: variantFields }),
    ),
    {
      name: 'createdBy',
      type: 'relationship',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
      relationTo: 'auth-users',
      required: true,
    },
  ],
}
