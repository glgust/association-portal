import { createContentSlug } from '@/modules/content/shared/slug'

export function createActivitySlug(title: string): string {
  return createContentSlug(title, 'activity')
}
