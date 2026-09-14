import {
  publicAnnouncementDetailSchema,
  publicAnnouncementListItemSchema,
  publicAnnouncementPageSchema,
  type PublicAnnouncementDetail,
  type PublicAnnouncementListItem,
  type PublicAnnouncementPage,
} from '@ascnucc/contracts'
import type { Payload, PayloadRequest } from 'payload'

import { publicContentPaginationQuerySchema } from '@/modules/content/shared/pagination'
import { BusinessError } from '@/modules/shared/business-error'

import { toPublicRichText } from './public-rich-text'

export const publicAnnouncementQuerySchema = publicContentPaginationQuerySchema

type AnnouncementDocument = {
  body?: unknown
  id: string
  publishedAt?: null | string
  slug?: null | string
  summary?: null | string
  title?: null | string
}

function toListItem(doc: AnnouncementDocument): PublicAnnouncementListItem {
  return publicAnnouncementListItemSchema.parse({
    id: doc.id,
    publishedAt: doc.publishedAt,
    slug: doc.slug,
    summary: doc.summary ?? null,
    title: doc.title,
  })
}

function toDetail(doc: AnnouncementDocument): PublicAnnouncementDetail {
  return publicAnnouncementDetailSchema.parse({
    ...toListItem(doc),
    body: toPublicRichText(doc.body),
  })
}

export async function listPublicAnnouncements(
  payload: Payload,
  req: PayloadRequest,
  input: { page: number; pageSize: number },
): Promise<PublicAnnouncementPage> {
  const result = await payload.find({
    collection: 'announcements',
    draft: false,
    limit: input.pageSize,
    overrideAccess: true,
    page: input.page,
    req,
    select: {
      id: true,
      publishedAt: true,
      slug: true,
      summary: true,
      title: true,
    },
    sort: ['-publishedAt', 'id'],
    where: { _status: { equals: 'published' } },
  })

  return publicAnnouncementPageSchema.parse({
    hasNextPage: result.hasNextPage,
    items: result.docs.map(toListItem),
    page: result.page ?? input.page,
    pageSize: result.limit,
    totalItems: result.totalDocs,
    totalPages: result.totalPages,
  })
}

export async function getPublicAnnouncement(
  payload: Payload,
  req: PayloadRequest,
  slug: string,
): Promise<PublicAnnouncementDetail> {
  const result = await payload.find({
    collection: 'announcements',
    draft: false,
    limit: 1,
    overrideAccess: true,
    req,
    select: {
      body: true,
      id: true,
      publishedAt: true,
      slug: true,
      summary: true,
      title: true,
    },
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }],
    },
  })
  const announcement = result.docs[0]
  if (!announcement) {
    throw new BusinessError('NOT_FOUND', 'Announcement not found', 404)
  }
  return toDetail(announcement)
}
