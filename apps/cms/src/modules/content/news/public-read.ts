import {
  publicNewsDetailSchema,
  publicNewsListItemSchema,
  publicNewsPageSchema,
  type PublicNewsDetail,
  type PublicNewsListItem,
  type PublicNewsPage,
} from '@ascnucc/contracts'
import type { Payload, PayloadRequest } from 'payload'

import { publicContentPaginationQuerySchema } from '@/modules/content/shared/pagination'
import { toPublicRichText } from '@/modules/content/shared/public-rich-text'
import { BusinessError } from '@/modules/shared/business-error'

export const publicNewsQuerySchema = publicContentPaginationQuerySchema

type NewsDocument = {
  body?: unknown
  id: string
  publishedAt?: null | string
  slug?: null | string
  summary?: null | string
  title?: null | string
}

function toListItem(doc: NewsDocument): PublicNewsListItem {
  try {
    return publicNewsListItemSchema.parse({
      id: doc.id,
      publishedAt: doc.publishedAt,
      slug: doc.slug,
      summary: doc.summary ?? null,
      title: doc.title,
    })
  } catch (cause) {
    throw new Error('Published News cannot be mapped to its public contract', {
      cause,
    })
  }
}

function toDetail(doc: NewsDocument): PublicNewsDetail {
  try {
    return publicNewsDetailSchema.parse({
      ...toListItem(doc),
      body: toPublicRichText(doc.body),
    })
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message === 'Published News cannot be mapped to its public contract'
    ) {
      throw cause
    }
    throw new Error('Published News body cannot be mapped publicly', { cause })
  }
}

export async function listPublicNews(
  payload: Payload,
  req: PayloadRequest,
  input: { page: number; pageSize: number },
): Promise<PublicNewsPage> {
  const result = await payload.find({
    collection: 'news',
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
  try {
    return publicNewsPageSchema.parse({
      hasNextPage: result.hasNextPage,
      items: result.docs.map(toListItem),
      page: result.page ?? input.page,
      pageSize: result.limit,
      totalItems: result.totalDocs,
      totalPages: result.totalPages,
    })
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message === 'Published News cannot be mapped to its public contract'
    ) {
      throw cause
    }
    throw new Error('Published News page metadata is invalid', { cause })
  }
}

export async function getPublicNews(
  payload: Payload,
  req: PayloadRequest,
  slug: string,
): Promise<PublicNewsDetail> {
  const result = await payload.find({
    collection: 'news',
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
  const news = result.docs[0]
  if (!news) throw new BusinessError('NOT_FOUND', 'News not found', 404)
  return toDetail(news)
}
