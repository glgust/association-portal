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

import { hasMeaningfulPublicText, toPublicRichText } from './public-rich-text'
import { createAnnouncementSlug } from './slug'

type AnnouncementData = {
  _status?: 'draft' | 'published'
  body?: unknown
  createdBy?: unknown
  id: string
  lastEditedBy?: unknown
  publishedAt?: null | string
  slug?: string
  title?: string
}

type PublicationAction = 'publish' | 'unpublish'

const publicationActionKey = 'announcementPublicationAction'
const publicationTimeKey = 'announcementPublicationTime'

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

function validatePublishBody(body: unknown, req: PayloadRequest): void {
  try {
    const publicBody = toPublicRichText(body)
    if (!hasMeaningfulPublicText(publicBody)) {
      throw new Error('Announcement body must contain meaningful content')
    }
  } catch {
    throw validationError(
      'body',
      '正文包含不支持的内容，或没有有意义的文字。',
      req,
    )
  }
}

export const prepareAnnouncementChange: CollectionBeforeChangeHook<
  AnnouncementData
> = async ({ data, operation, originalDoc, req }) => {
  const actor = await loadActor(req.payload, req)
  if (!actor) throw new Forbidden(req.t)

  if (operation === 'create') {
    if (typeof data.title !== 'string' || !data.title.trim()) {
      throw validationError('title', '标题为必填项。', req)
    }
    data.slug = createAnnouncementSlug(data.title)
    data.createdBy = actor.id
  } else {
    if (data.slug !== undefined && data.slug !== originalDoc?.slug) {
      throw validationError('slug', '公告 slug 创建后不可修改。', req)
    }
    data.slug = originalDoc?.slug
    data.createdBy = originalDoc?.createdBy
  }

  data.lastEditedBy = actor.id

  // Payload treats every non-draft write as a live write even when the client
  // omits `_status`, so authorization cannot depend on that field being present.
  const isDraftWrite = isDraftRequest(req) && data._status !== 'published'

  if (!isDraftWrite) {
    await requireDirectPublish(req)
    const isUnpublish = operation === 'update' && data._status === 'draft'
    const action: PublicationAction = isUnpublish ? 'unpublish' : 'publish'
    const now = new Date().toISOString()
    req.context[publicationActionKey] = action
    req.context[publicationTimeKey] = now

    if (action === 'publish') {
      validatePublishBody(data.body ?? originalDoc?.body, req)
      data._status = 'published'
      data.publishedAt = now
    } else {
      data._status = 'draft'
      data.publishedAt = originalDoc?.publishedAt
    }
  } else if (operation === 'update') {
    data.publishedAt = originalDoc?.publishedAt
  }

  return data
}

export const auditAnnouncementPublication: CollectionAfterChangeHook<
  AnnouncementData
> = async ({ doc, req }) => {
  const action = req.context[publicationActionKey] as
    | PublicationAction
    | undefined
  if (!action) return doc

  const actor = await loadActor(req.payload, req)
  if (!actor) throw new Forbidden(req.t)
  const occurredAt = req.context[publicationTimeKey]
  if (typeof occurredAt !== 'string') {
    throw new Error('Announcement publication time is missing')
  }

  setAuditOperation(
    req.context,
    action === 'publish'
      ? auditOperations.publishAnnouncement
      : auditOperations.unpublishAnnouncement,
  )
  await req.payload.create({
    collection: 'audit-events',
    data: {
      action: `content.announcement.${action === 'publish' ? 'published' : 'unpublished'}`,
      actor: actor.id,
      occurredAt,
      requestId: requestIdFrom(req.headers),
      result: 'success',
      targetId: doc.id,
      targetType: 'announcement',
    },
    overrideAccess: false,
    req,
  })

  delete req.context[publicationActionKey]
  delete req.context[publicationTimeKey]
  return doc
}
