import type { Access } from 'payload'

import { isAllowedGlobalContent } from '@/modules/content/shared/access'

export const canCreateAnnouncement: Access = (args) =>
  isAllowedGlobalContent('content.create', args)

export const canEditAnnouncement: Access = (args) =>
  isAllowedGlobalContent('content.edit', args)

export const canReadAnnouncement: Access = async (args) => {
  return isAllowedGlobalContent('content.edit', args)
}
