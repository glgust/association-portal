'use server'

import {
  publicAnnouncementDetailSchema,
  type PublicAnnouncementDetail,
} from '@ascnucc/contracts'

import {
  AnnouncementNotFoundError,
  AnnouncementUnavailableError,
  getPublicAnnouncement,
} from '@/server/announcements'

export type AnnouncementDetailResult =
  | { data: PublicAnnouncementDetail; status: 'success' }
  | { status: 'not-found' }
  | { requestId: string; status: 'unavailable' }

export async function loadAnnouncementDetail(
  rawSlug: string,
): Promise<AnnouncementDetailResult> {
  const slug = publicAnnouncementDetailSchema.shape.slug.safeParse(rawSlug)
  if (!slug.success) return { status: 'not-found' }

  try {
    return {
      data: await getPublicAnnouncement(slug.data),
      status: 'success',
    }
  } catch (error) {
    if (error instanceof AnnouncementNotFoundError) {
      return { status: 'not-found' }
    }
    if (error instanceof AnnouncementUnavailableError) {
      return { requestId: error.requestId, status: 'unavailable' }
    }
    throw error
  }
}
