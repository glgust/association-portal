import { createContentSlug } from '@/modules/content/shared/slug'

export function createAnnouncementSlug(title: string): string {
  return createContentSlug(title, 'announcement')
}
