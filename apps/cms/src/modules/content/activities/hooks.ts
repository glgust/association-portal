import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  PayloadRequest,
} from 'payload'
import { Forbidden, ValidationError } from 'payload'

import { auditOperations, setAuditOperation } from '@/modules/audit/context'
import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import { requestIdFrom } from '@/modules/http/request'

import { validateActivityForPublication } from './publication'
import { createActivitySlug } from './slug'

type ActivityData = {
  _status?: 'draft' | 'published'
  activityType?: unknown
  body?: unknown
  cancellationNote?: unknown
  createdBy?: unknown
  endsAt?: unknown
  historySortAt?: null | string
  id: string
  isCancelled?: unknown
  lastEditedBy?: unknown
  location?: unknown
  publishedAt?: null | string
  scheduleText?: unknown
  slug?: string
  startsAt?: unknown
  summary?: unknown
  title?: unknown
}

type PublicationAction = 'publish' | 'unpublish'

const publicationActionKey = 'activityPublicationAction'
const publicationTimeKey = 'activityPublicationTime'

function isDraftRequest(req: PayloadRequest): boolean {
  const draft = req.query.draft
  return draft === true || draft === 'true'
}

async function requireDirectPublish(req: PayloadRequest) {
  const actor = await loadActor(req.payload, req)
  if (!actor) throw new Forbidden(req.t)
  const decision = authorize(
    actor,
    'content.directPublish',
    { type: 'global' },
    new Date(),
  )
  if (!decision.allowed) throw new Forbidden(req.t)
  return actor
}

function validatePublication(data: ActivityData, req: PayloadRequest): void {
  const issues = validateActivityForPublication(data)
  if (issues.length === 0) return
  throw new ValidationError({
    errors: issues.map(({ message, path }) => ({ message, path })),
    req,
  })
}

function trimOrNull(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() || null : value
}

function normalizeMultilineOrNull(value: unknown): unknown {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').trim() || null
    : value
}

function normalizeInactiveFields(candidate: ActivityData): ActivityData {
  const normalized = { ...candidate }
  if (normalized.activityType === 'temporary') normalized.scheduleText = null
  if (normalized.activityType === 'standing') {
    normalized.startsAt = null
    normalized.endsAt = null
  }
  if (normalized.isCancelled === false) normalized.cancellationNote = null
  return normalized
}

async function requireCurrentlyPublished(
  req: PayloadRequest,
  id: string,
): Promise<void> {
  const result = await req.payload.find({
    collection: 'activities',
    depth: 0,
    draft: false,
    limit: 1,
    overrideAccess: true,
    page: 1,
    pagination: false,
    req,
    select: {},
    where: {
      and: [{ id: { equals: id } }, { _status: { equals: 'published' } }],
    },
  })
  if (result.docs.length !== 1) {
    throw new ValidationError({
      errors: [
        {
          message: '只有当前已发布的活动才能下线。',
          path: '_status',
        },
      ],
      req,
    })
  }
}

function validateDraftShape(data: ActivityData, req: PayloadRequest): void {
  const errors: Array<{ message: string; path: string }> = []
  if (data.activityType !== 'temporary' && data.activityType !== 'standing') {
    errors.push({
      message: '活动类型必须是临时活动或常驻活动。',
      path: 'activityType',
    })
  }
  if (typeof data.title !== 'string' || !data.title.trim()) {
    errors.push({ message: '标题为必填项。', path: 'title' })
  }
  if (typeof data.isCancelled !== 'boolean') {
    errors.push({ message: '取消状态无效。', path: 'isCancelled' })
  }
  for (const field of [
    'summary',
    'location',
    'scheduleText',
    'cancellationNote',
    'startsAt',
    'endsAt',
  ] as const) {
    const value = data[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      errors.push({ message: '字段类型无效。', path: field })
    }
  }
  if (errors.length > 0) throw new ValidationError({ errors, req })
}

export const prepareActivityChange: CollectionBeforeChangeHook<
  ActivityData
> = async ({ data, operation, originalDoc, req }) => {
  const actor = await loadActor(req.payload, req)
  if (!actor) throw new Forbidden(req.t)

  if (operation === 'create') {
    if (typeof data.title !== 'string') {
      throw new ValidationError({
        errors: [{ message: '标题为必填项。', path: 'title' }],
        req,
      })
    }
    data.slug = createActivitySlug(data.title)
    data.createdBy = actor.id
  } else {
    if (data.slug !== undefined && data.slug !== originalDoc?.slug) {
      throw new ValidationError({
        errors: [{ message: '活动 slug 创建后不可修改。', path: 'slug' }],
        req,
      })
    }
    data.slug = originalDoc?.slug
    data.createdBy = originalDoc?.createdBy
  }

  data.lastEditedBy = actor.id
  const candidate = normalizeInactiveFields({
    ...originalDoc,
    ...data,
  } as ActivityData)
  for (const field of [
    'startsAt',
    'endsAt',
    'scheduleText',
    'cancellationNote',
  ] as const) {
    data[field] = candidate[field]
  }
  validateDraftShape(candidate, req)
  const isDraftWrite = isDraftRequest(req) && data._status !== 'published'

  if (!isDraftWrite) {
    await requireDirectPublish(req)
    const isUnpublish = operation === 'update' && data._status === 'draft'
    const action: PublicationAction = isUnpublish ? 'unpublish' : 'publish'
    const now = new Date().toISOString()

    if (action === 'publish') {
      const publicationCandidate = {
        ...candidate,
        cancellationNote: normalizeMultilineOrNull(candidate.cancellationNote),
        location: trimOrNull(candidate.location),
        scheduleText: normalizeMultilineOrNull(candidate.scheduleText),
        summary: normalizeMultilineOrNull(candidate.summary),
        title: trimOrNull(candidate.title),
      } as ActivityData
      validatePublication(publicationCandidate, req)
      data.title = publicationCandidate.title
      data.summary = publicationCandidate.summary
      data.location = publicationCandidate.location
      data.scheduleText = publicationCandidate.scheduleText
      data.cancellationNote = publicationCandidate.cancellationNote
      data._status = 'published'
      data.publishedAt = now
      data.historySortAt =
        publicationCandidate.activityType === 'temporary'
          ? (publicationCandidate.endsAt as string)
          : now
    } else {
      await requireCurrentlyPublished(req, originalDoc?.id as string)
      data._status = 'draft'
      data.publishedAt = originalDoc?.publishedAt
      data.historySortAt = originalDoc?.historySortAt
    }
    req.context[publicationActionKey] = action
    req.context[publicationTimeKey] = now
  } else if (operation === 'update') {
    data.publishedAt = originalDoc?.publishedAt
    data.historySortAt = originalDoc?.historySortAt
  }

  return data
}

export const auditActivityPublication: CollectionAfterChangeHook<
  ActivityData
> = async ({ doc, req }) => {
  const action = req.context[publicationActionKey] as
    | PublicationAction
    | undefined
  if (!action) return doc

  const actor = await loadActor(req.payload, req)
  if (!actor) throw new Forbidden(req.t)
  const occurredAt = req.context[publicationTimeKey]
  if (typeof occurredAt !== 'string') {
    throw new Error('Activity publication time is missing')
  }

  setAuditOperation(
    req.context,
    action === 'publish'
      ? auditOperations.publishActivity
      : auditOperations.unpublishActivity,
  )
  await req.payload.create({
    collection: 'audit-events',
    data: {
      action: `content.activity.${action === 'publish' ? 'published' : 'unpublished'}`,
      actor: actor.id,
      occurredAt,
      requestId: requestIdFrom(req.headers),
      result: 'success',
      targetId: doc.id,
      targetType: 'activity',
    },
    overrideAccess: false,
    req,
  })

  delete req.context[publicationActionKey]
  delete req.context[publicationTimeKey]
  return doc
}
