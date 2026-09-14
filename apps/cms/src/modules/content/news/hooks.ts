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

import { normalizeNewsText, validateNewsForPublication } from './publication'
import { createNewsSlug } from './slug'

type NewsData = {
  _status?: 'draft' | 'published'
  body?: unknown
  createdBy?: unknown
  id: string
  lastEditedBy?: unknown
  publishedAt?: null | string
  slug?: string
  summary?: unknown
  title?: unknown
}

type PublicationAction = 'publish' | 'unpublish'

const publicationActionKey = 'newsPublicationAction'
const publicationTimeKey = 'newsPublicationTime'

function isDraftRequest(req: PayloadRequest): boolean {
  const draft = req.query.draft
  return draft === true || draft === 'true'
}

function validationError(
  path: string,
  message: string,
  req: PayloadRequest,
): ValidationError {
  return new ValidationError({ errors: [{ message, path }], req })
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

async function requireCurrentlyPublished(
  req: PayloadRequest,
  id: string,
): Promise<void> {
  const result = await req.payload.find({
    collection: 'news',
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
    throw validationError('_status', '只有当前已发布的新闻才能下线。', req)
  }
}

function normalizeDraftText(
  data: Partial<NewsData>,
  originalDoc: Partial<NewsData> | undefined,
) {
  const titleSource = Object.hasOwn(data, 'title')
    ? data.title
    : originalDoc?.title
  const summarySource = Object.hasOwn(data, 'summary')
    ? data.summary
    : originalDoc?.summary
  const normalizedTitle = normalizeNewsText(titleSource, 'title')
  if (normalizedTitle === null) return { title: null }
  return {
    invalidSummary:
      summarySource !== undefined &&
      summarySource !== null &&
      summarySource !== '' &&
      !(
        typeof summarySource === 'string' &&
        summarySource.normalize('NFKC').trim() === ''
      ) &&
      normalizeNewsText(summarySource, 'summary') === null,
    summary: normalizeNewsText(summarySource, 'summary'),
    title: normalizedTitle,
  }
}

export const prepareNewsChange: CollectionBeforeChangeHook<NewsData> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const actor = await loadActor(req.payload, req)
  if (!actor) throw new Forbidden(req.t)

  const normalized = normalizeDraftText(data, originalDoc)
  if (normalized.title === null) {
    throw validationError(
      'title',
      '标题必须为 1–120 个无控制字符的单行文字。',
      req,
    )
  }
  if (normalized.invalidSummary) {
    throw validationError(
      'summary',
      '摘要必须为不超过 240 个无控制字符的单行文字。',
      req,
    )
  }
  data.title = normalized.title
  data.summary = normalized.summary ?? null

  if (operation === 'create') {
    data.slug = createNewsSlug(normalized.title)
    data.createdBy = actor.id
  } else {
    if (data.slug !== undefined && data.slug !== originalDoc?.slug) {
      throw validationError('slug', '新闻 slug 创建后不可修改。', req)
    }
    data.slug = originalDoc?.slug
    data.createdBy = originalDoc?.createdBy
  }
  data.lastEditedBy = actor.id

  const isDraftWrite = isDraftRequest(req) && data._status !== 'published'
  if (!isDraftWrite) {
    await requireDirectPublish(req)
    const isUnpublish = operation === 'update' && data._status === 'draft'
    const action: PublicationAction = isUnpublish ? 'unpublish' : 'publish'
    const now = new Date().toISOString()

    if (action === 'publish') {
      const issues = validateNewsForPublication({
        body: data.body ?? originalDoc?.body,
        summary: data.summary,
        title: data.title,
      })
      if (issues.length > 0) {
        throw new ValidationError({ errors: issues, req })
      }
      data._status = 'published'
      data.publishedAt = now
    } else {
      await requireCurrentlyPublished(req, originalDoc?.id as string)
      data._status = 'draft'
      data.publishedAt = originalDoc?.publishedAt
    }
    req.context[publicationActionKey] = action
    req.context[publicationTimeKey] = now
  } else if (operation === 'update') {
    data.publishedAt = originalDoc?.publishedAt
  }

  return data
}

export const auditNewsPublication: CollectionAfterChangeHook<
  NewsData
> = async ({ doc, req }) => {
  const action = req.context[publicationActionKey] as
    | PublicationAction
    | undefined
  if (!action) return doc

  try {
    const actor = await loadActor(req.payload, req)
    if (!actor) throw new Forbidden(req.t)
    const occurredAt = req.context[publicationTimeKey]
    if (typeof occurredAt !== 'string') {
      throw new Error('News publication time is missing')
    }
    setAuditOperation(
      req.context,
      action === 'publish'
        ? auditOperations.publishNews
        : auditOperations.unpublishNews,
    )
    await req.payload.create({
      collection: 'audit-events',
      data: {
        action: `content.news.${action === 'publish' ? 'published' : 'unpublished'}`,
        actor: actor.id,
        occurredAt,
        requestId: requestIdFrom(req.headers),
        result: 'success',
        targetId: doc.id,
        targetType: 'news',
      },
      overrideAccess: false,
      req,
    })
    return doc
  } finally {
    delete req.context[publicationActionKey]
    delete req.context[publicationTimeKey]
    delete req.context.auditOperation
  }
}
