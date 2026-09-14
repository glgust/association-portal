import type { Access } from 'payload'

import { isAllowedGlobalContent } from '@/modules/content/shared/access'

export const canCreateActivity: Access = (args) =>
  isAllowedGlobalContent('content.create', args)

export const canEditActivity: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)

export const canReadActivity: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)
