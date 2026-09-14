import type { Access } from 'payload'

import { isAllowedGlobalContent } from '@/modules/content/shared/access'

export const canCreateGalleryWork: Access = (args) =>
  isAllowedGlobalContent('content.create', args)

export const canEditGalleryWork: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)

export const canReadGalleryWork: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)
