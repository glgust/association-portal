import type { Access } from 'payload'

import { isAllowedGlobalContent } from '@/modules/content/shared/access'

export const canCreateAssociationPage: Access = (args) =>
  isAllowedGlobalContent('content.create', args)
export const canEditAssociationPage: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)
export const canReadAssociationPage: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)
