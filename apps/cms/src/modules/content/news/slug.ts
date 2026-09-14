import { createContentSlug } from '@/modules/content/shared/slug'

export function createNewsSlug(title: string): string {
  return createContentSlug(title, 'news')
}
