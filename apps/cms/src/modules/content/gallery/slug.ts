import { createContentSlug } from '@/modules/content/shared/slug'

export function createGallerySlug(title: string): string {
  const asciiTitle = title.normalize('NFKD').replace(/[^\x00-\x7f]+/g, ' ')
  return createContentSlug(asciiTitle, 'gallery-work')
}
