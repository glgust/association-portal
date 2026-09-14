import {
  publicActivityDetailSchema,
  publicActivityListItemSchema,
  publicActivityPageSchema,
  type PublicActivityDetail,
  type PublicActivityListItem,
  type PublicActivityPage,
} from '@ascnucc/contracts'
import type { Payload, PayloadRequest, Where } from 'payload'

import { publicContentPaginationQuerySchema } from '@/modules/content/shared/pagination'
import { toPublicRichText } from '@/modules/content/shared/public-rich-text'
import { BusinessError } from '@/modules/shared/business-error'

import { deriveActivityStatus } from './domain'

export const publicActivityQuerySchema = publicContentPaginationQuerySchema

type ActivityDocument = {
  activityType?: null | string
  body?: unknown
  cancellationNote?: null | string
  endsAt?: null | string
  historySortAt?: null | string
  id: string
  isCancelled?: null | boolean
  location?: null | string
  publishedAt?: null | string
  scheduleText?: null | string
  slug?: null | string
  startsAt?: null | string
  summary?: null | string
  title?: null | string
}

const publicSelect = {
  activityType: true,
  cancellationNote: true,
  endsAt: true,
  historySortAt: true,
  isCancelled: true,
  location: true,
  publishedAt: true,
  scheduleText: true,
  slug: true,
  startsAt: true,
  summary: true,
  title: true,
} as const

function withPublished(where: Where): Where {
  return { and: [{ _status: { equals: 'published' } }, where] }
}

function statusInput(doc: ActivityDocument) {
  if (typeof doc.isCancelled !== 'boolean') {
    throw new Error('Published activity has an invalid cancellation state')
  }
  if (
    typeof doc.historySortAt !== 'string' ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(doc.historySortAt) ||
    !Number.isFinite(Date.parse(doc.historySortAt))
  ) {
    throw new Error('Published activity has an invalid history projection')
  }
  if (doc.activityType === 'temporary') {
    if (
      typeof doc.endsAt !== 'string' ||
      Date.parse(doc.historySortAt) !== Date.parse(doc.endsAt)
    ) {
      throw new Error('Temporary activity has an invalid history projection')
    }
    return {
      activityType: 'temporary' as const,
      endsAt: doc.endsAt ?? '',
      isCancelled: doc.isCancelled,
      startsAt: doc.startsAt ?? '',
    }
  }
  if (doc.activityType === 'standing') {
    if (
      typeof doc.publishedAt !== 'string' ||
      Date.parse(doc.historySortAt) !== Date.parse(doc.publishedAt)
    ) {
      throw new Error('Standing activity has an invalid history projection')
    }
    return {
      activityType: 'standing' as const,
      isCancelled: doc.isCancelled,
    }
  }
  throw new Error('Published activity has an invalid type')
}

function toListItem(doc: ActivityDocument, asOf: Date): PublicActivityListItem {
  const status = deriveActivityStatus(statusInput(doc), asOf)
  const common = {
    activityType: doc.activityType,
    cancellationNote: status === 'cancelled' ? doc.cancellationNote : null,
    id: doc.id,
    location: doc.location,
    publishedAt: doc.publishedAt,
    slug: doc.slug,
    status,
    summary: doc.summary ?? null,
    title: doc.title,
    version: 1,
  }

  return publicActivityListItemSchema.parse(
    doc.activityType === 'temporary'
      ? { ...common, endsAt: doc.endsAt, startsAt: doc.startsAt }
      : { ...common, scheduleText: doc.scheduleText },
  )
}

function toDetail(doc: ActivityDocument, asOf: Date): PublicActivityDetail {
  return publicActivityDetailSchema.parse({
    ...toListItem(doc, asOf),
    body: toPublicRichText(doc.body),
  })
}

async function countSegment(
  payload: Payload,
  req: PayloadRequest,
  where: Where,
): Promise<number> {
  const result = await payload.find({
    collection: 'activities',
    draft: false,
    limit: 1,
    overrideAccess: true,
    page: 1,
    req,
    select: { slug: true },
    where: withPublished(where),
  })
  return result.totalDocs
}

async function countPublished(
  payload: Payload,
  req: PayloadRequest,
): Promise<number> {
  const result = await payload.find({
    collection: 'activities',
    draft: false,
    limit: 1,
    overrideAccess: true,
    page: 1,
    req,
    select: { slug: true },
    where: { _status: { equals: 'published' } },
  })
  return result.totalDocs
}

async function loadWindow(
  payload: Payload,
  req: PayloadRequest,
  where: Where,
  sort: string[],
  offset: number,
  take: number,
  pageSize: number,
  asOf: Date,
): Promise<PublicActivityListItem[]> {
  if (take <= 0) return []
  const page = Math.floor(offset / pageSize) + 1
  const withinPage = offset % pageSize
  const first = await payload.find({
    collection: 'activities',
    draft: false,
    limit: pageSize,
    overrideAccess: true,
    page,
    req,
    select: publicSelect,
    sort,
    where: withPublished(where),
  })
  const docs = [...(first.docs as ActivityDocument[])]
  if (withinPage + take > pageSize) {
    const second = await payload.find({
      collection: 'activities',
      draft: false,
      limit: pageSize,
      overrideAccess: true,
      page: page + 1,
      req,
      select: publicSelect,
      sort,
      where: withPublished(where),
    })
    docs.push(...(second.docs as ActivityDocument[]))
  }
  return docs
    .slice(withinPage, withinPage + take)
    .map((doc) => toListItem(doc, asOf))
}

type Segment = {
  count: number
  load: (offset: number, take: number) => Promise<PublicActivityListItem[]>
}

async function sliceSequentialSegments(
  segments: Segment[],
  offset: number,
  limit: number,
): Promise<PublicActivityListItem[]> {
  const items: PublicActivityListItem[] = []
  let segmentStart = 0

  for (const segment of segments) {
    if (items.length >= limit) break
    const withinSegment = Math.max(0, offset - segmentStart)
    if (withinSegment < segment.count) {
      const take = Math.min(limit - items.length, segment.count - withinSegment)
      items.push(...(await segment.load(withinSegment, take)))
    }
    segmentStart += segment.count
  }

  return items
}

export async function listPublicActivities(
  payload: Payload,
  req: PayloadRequest,
  input: { page: number; pageSize: number },
  asOf = new Date(),
): Promise<PublicActivityPage> {
  if (
    !Number.isSafeInteger(input.page) ||
    input.page < 1 ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > 50
  ) {
    throw new Error('Invalid activity pagination window')
  }
  const asOfIso = asOf.toISOString()
  const ongoingTemporaryWhere: Where = {
    and: [
      { activityType: { equals: 'temporary' } },
      { isCancelled: { equals: false } },
      { startsAt: { less_than_equal: asOfIso } },
      { endsAt: { greater_than: asOfIso } },
      { historySortAt: { exists: true } },
    ],
  }
  const ongoingStandingWhere: Where = {
    and: [
      { activityType: { equals: 'standing' } },
      { isCancelled: { equals: false } },
      { historySortAt: { exists: true } },
    ],
  }
  const upcomingWhere: Where = {
    and: [
      { activityType: { equals: 'temporary' } },
      { isCancelled: { equals: false } },
      { startsAt: { greater_than: asOfIso } },
      { endsAt: { exists: true } },
      { historySortAt: { exists: true } },
    ],
  }
  const historyTemporaryWhere: Where = {
    and: [
      { activityType: { equals: 'temporary' } },
      { startsAt: { exists: true } },
      { endsAt: { exists: true } },
      { historySortAt: { exists: true } },
      {
        or: [
          { isCancelled: { equals: true } },
          {
            and: [
              { isCancelled: { equals: false } },
              { endsAt: { less_than_equal: asOfIso } },
            ],
          },
        ],
      },
    ],
  }
  const historyStandingWhere: Where = {
    and: [
      { activityType: { equals: 'standing' } },
      { isCancelled: { equals: true } },
      { historySortAt: { exists: true } },
    ],
  }

  const [
    ongoingTemporaryCount,
    ongoingStandingCount,
    upcomingCount,
    historyTemporaryCount,
    historyStandingCount,
    publishedTotal,
  ] = await Promise.all([
    countSegment(payload, req, ongoingTemporaryWhere),
    countSegment(payload, req, ongoingStandingWhere),
    countSegment(payload, req, upcomingWhere),
    countSegment(payload, req, historyTemporaryWhere),
    countSegment(payload, req, historyStandingWhere),
    countPublished(payload, req),
  ])

  const historyCount = historyTemporaryCount + historyStandingCount
  const totalItems =
    ongoingTemporaryCount + ongoingStandingCount + upcomingCount + historyCount
  if (publishedTotal !== totalItems) {
    throw new Error('Published activity catalog contains an invalid row')
  }
  const offset = (input.page - 1) * input.pageSize
  if (!Number.isSafeInteger(offset)) {
    throw new Error('Invalid activity pagination offset')
  }

  const historyWhere: Where = {
    or: [historyTemporaryWhere, historyStandingWhere],
  }

  const historySegment: Segment = {
    count: historyCount,
    load: (segmentOffset, take) =>
      loadWindow(
        payload,
        req,
        historyWhere,
        ['-historySortAt', 'id'],
        segmentOffset,
        take,
        input.pageSize,
        asOf,
      ),
  }

  const items = await sliceSequentialSegments(
    [
      {
        count: ongoingTemporaryCount,
        load: (segmentOffset, take) =>
          loadWindow(
            payload,
            req,
            ongoingTemporaryWhere,
            ['endsAt', 'id'],
            segmentOffset,
            take,
            input.pageSize,
            asOf,
          ),
      },
      {
        count: ongoingStandingCount,
        load: (segmentOffset, take) =>
          loadWindow(
            payload,
            req,
            ongoingStandingWhere,
            ['-publishedAt', 'id'],
            segmentOffset,
            take,
            input.pageSize,
            asOf,
          ),
      },
      {
        count: upcomingCount,
        load: (segmentOffset, take) =>
          loadWindow(
            payload,
            req,
            upcomingWhere,
            ['startsAt', 'id'],
            segmentOffset,
            take,
            input.pageSize,
            asOf,
          ),
      },
      historySegment,
    ],
    offset,
    input.pageSize,
  )

  const expectedItemCount = Math.max(
    0,
    Math.min(input.pageSize, totalItems - offset),
  )
  if (
    items.length !== expectedItemCount ||
    new Set(items.map((item) => item.id)).size !== items.length
  ) {
    throw new Error('Activity catalog changed during pagination')
  }

  const totalPages =
    totalItems === 0 ? 0 : Math.ceil(totalItems / input.pageSize)
  return publicActivityPageSchema.parse({
    asOf: asOfIso,
    hasNextPage: input.page < totalPages,
    items,
    page: input.page,
    pageSize: input.pageSize,
    totalItems,
    totalPages,
  })
}

export async function getPublicActivity(
  payload: Payload,
  req: PayloadRequest,
  slug: string,
  asOf = new Date(),
): Promise<PublicActivityDetail> {
  const result = await payload.find({
    collection: 'activities',
    draft: false,
    limit: 1,
    overrideAccess: true,
    req,
    select: { ...publicSelect, body: true },
    where: withPublished({ slug: { equals: slug } }),
  })
  const activity = result.docs[0] as ActivityDocument | undefined
  if (!activity) throw new BusinessError('NOT_FOUND', 'Activity not found', 404)
  return toDetail(activity, asOf)
}
