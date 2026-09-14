import type { Access } from 'payload'

import { isAllowedGlobalContent } from '@/modules/content/shared/access'

export const canCreateNews: Access = (args) =>
  isAllowedGlobalContent('content.create', args)

export const canEditNews: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)

export const canReadNews: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)
