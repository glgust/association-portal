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

import {
  isCompleteMediaAsset,
  normalizeGalleryText,
  normalizeOptionalGalleryText,
  publicAuthorNameFor,
  type GalleryAuthorIdentity,
  type MediaAssetCandidate,
} from './publication'
import { createGallerySlug } from './slug'

type RelationValue = null | string | { id?: unknown }

type GalleryData = {
  _status?: 'draft' | 'published'
  altText?: unknown
  author?: RelationValue
  createdBy?: RelationValue
  displayRightsConfirmed?: unknown
  id: string
  lastEditedBy?: RelationValue
  media?: RelationValue
  penName?: unknown
  publicAuthorName?: unknown
  publishedAt?: null | string
  recognizablePeople?: null | 'consentConfirmed' | 'none'
  slug?: string
  summary?: unknown
  title?: unknown
}

type PublicationAction = 'publish' | 'unpublish'

const publicationActionKey = 'galleryPublicationAction'
const publicationTimeKey = 'galleryPublicationTime'

function relationId(value: RelationValue | undefined): string | null {
  if (typeof value === 'string') return value
  return value && typeof value.id === 'string' ? value.id : null
}

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
    collection: 'gallery-works',
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
    throw validationError('_status', '只有当前已发布的画廊作品才能下线。', req)
  }
}

async function loadAuthor(
  req: PayloadRequest,
  authorId: string,
): Promise<GalleryAuthorIdentity | null> {
  const result = await req.payload.find({
    collection: 'auth-users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: {
      displayName: true,
      studentNumber: true,
      username: true,
    },
    where: { id: { equals: authorId } },
  })
  return (result.docs[0] as GalleryAuthorIdentity | undefined) ?? null
}

async function loadMedia(
  req: PayloadRequest,
  mediaId: string,
): Promise<MediaAssetCandidate | null> {
  const result = await req.payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: { id: { equals: mediaId } },
  })
  return (result.docs[0] as MediaAssetCandidate | undefined) ?? null
}

function normalizeDraftFields(
  data: Partial<GalleryData>,
  originalDoc: Partial<GalleryData> | undefined,
  req: PayloadRequest,
): void {
  const title = normalizeGalleryText(
    Object.hasOwn(data, 'title') ? data.title : originalDoc?.title,
    120,
  )
  if (!title) {
    throw validationError(
      'title',
      '标题必须为 1–120 个无控制字符的单行文字。',
      req,
    )
  }
  const altTextSource = Object.hasOwn(data, 'altText')
    ? data.altText
    : originalDoc?.altText
  const altText = normalizeOptionalGalleryText(altTextSource, 240)
  if (altText === undefined) {
    throw validationError(
      'altText',
      '替代文本必须为 1–240 个无控制字符的单行文字。',
      req,
    )
  }
  const summary = normalizeOptionalGalleryText(
    Object.hasOwn(data, 'summary') ? data.summary : originalDoc?.summary,
    240,
  )
  if (summary === undefined) {
    throw validationError(
      'summary',
      '摘要必须为不超过 240 个无控制字符的单行文字。',
      req,
    )
  }
  const penName = normalizeOptionalGalleryText(
    Object.hasOwn(data, 'penName') ? data.penName : originalDoc?.penName,
    100,
  )
  if (penName === undefined) {
    throw validationError(
      'penName',
      '笔名必须为 1–100 个无控制字符的单行文字，或留空。',
      req,
    )
  }
  data.title = title
  data.altText = altText
  data.summary = summary
  data.penName = penName
}

export const prepareGalleryChange: CollectionBeforeChangeHook<
  GalleryData
> = async ({ data, operation, originalDoc, req }) => {
  const actor = await loadActor(req.payload, req)
  if (!actor) throw new Forbidden(req.t)
  normalizeDraftFields(data, originalDoc, req)
  const isDraftWrite = isDraftRequest(req) && data._status !== 'published'

  if (operation === 'create') {
    data.slug = createGallerySlug(data.title as string)
    data.createdBy = actor.id
  } else {
    if (data.slug !== undefined && data.slug !== originalDoc?.slug) {
      throw validationError('slug', '画廊作品 slug 创建后不可修改。', req)
    }
    data.slug = originalDoc?.slug
    data.createdBy = originalDoc?.createdBy
  }
  data.lastEditedBy = actor.id

  const originalAuthorId = relationId(originalDoc?.author)
  const requestedAuthorId = relationId(data.author)
  const authorId =
    requestedAuthorId ??
    originalAuthorId ??
    (operation === 'create' ? actor.id : null)
  if (!authorId) {
    if (!isDraftWrite) {
      throw validationError('author', '必须选择可追溯的内部作者。', req)
    }
    data.author = null
  } else if (authorId !== originalAuthorId && authorId !== actor.id) {
    const canManageAccounts = authorize(
      actor,
      'accounts.manage',
      { type: 'global' },
      new Date(),
    ).allowed
    if (!canManageAccounts) throw new Forbidden(req.t)
  }
  if (authorId) data.author = authorId

  const originalMediaId = relationId(originalDoc?.media)
  const mediaId = relationId(data.media) ?? originalMediaId
  if (!mediaId && !isDraftWrite) {
    throw validationError('media', '必须选择完整的媒体资产。', req)
  }
  data.media = mediaId
  if (operation === 'create' || (mediaId && mediaId !== originalMediaId)) {
    data.displayRightsConfirmed = false
    data.recognizablePeople = null
  } else {
    if (!Object.hasOwn(data, 'displayRightsConfirmed')) {
      data.displayRightsConfirmed = originalDoc?.displayRightsConfirmed
    }
    if (!Object.hasOwn(data, 'recognizablePeople')) {
      data.recognizablePeople = originalDoc?.recognizablePeople
    }
  }

  if (!isDraftWrite) {
    await requireDirectPublish(req)
    const action: PublicationAction =
      operation === 'update' && data._status === 'draft'
        ? 'unpublish'
        : 'publish'
    const now = new Date().toISOString()

    if (action === 'publish') {
      const publishedAltText = normalizeGalleryText(data.altText, 240)
      if (!publishedAltText) {
        throw validationError(
          'altText',
          '发布前必须填写安全、准确的替代文本。',
          req,
        )
      }
      data.altText = publishedAltText
      const media = mediaId ? await loadMedia(req, mediaId) : null
      if (!isCompleteMediaAsset(media)) {
        throw validationError('media', '媒体资产不完整，不能发布。', req)
      }
      if (data.displayRightsConfirmed !== true) {
        throw validationError(
          'displayRightsConfirmed',
          '发布前必须确认作品展示权利。',
          req,
        )
      }
      if (
        !['none', 'consentConfirmed'].includes(data.recognizablePeople ?? '')
      ) {
        throw validationError(
          'recognizablePeople',
          '发布前必须明确作品是否含可识别人像及其同意状态。',
          req,
        )
      }
      const author = authorId ? await loadAuthor(req, authorId) : null
      const publicAuthorName = author
        ? publicAuthorNameFor(author, data.penName as null | string)
        : null
      if (!publicAuthorName) {
        throw validationError(
          'penName',
          '公开署名缺失或包含所选作者的账号标识。',
          req,
        )
      }
      data.publicAuthorName = publicAuthorName
      data._status = 'published'
      data.publishedAt = now
    } else {
      await requireCurrentlyPublished(req, originalDoc?.id as string)
      data._status = 'draft'
      data.publishedAt = originalDoc?.publishedAt
      data.publicAuthorName = originalDoc?.publicAuthorName
    }
    req.context[publicationActionKey] = action
    req.context[publicationTimeKey] = now
  } else if (operation === 'update') {
    data.publishedAt = originalDoc?.publishedAt
    data.publicAuthorName = originalDoc?.publicAuthorName
  }

  return data
}

export const auditGalleryPublication: CollectionAfterChangeHook<
  GalleryData
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
      throw new Error('Gallery publication time is missing')
    }
    setAuditOperation(
      req.context,
      action === 'publish'
        ? auditOperations.publishGallery
        : auditOperations.unpublishGallery,
    )
    await req.payload.create({
      collection: 'audit-events',
      data: {
        action: `content.gallery.${action === 'publish' ? 'published' : 'unpublished'}`,
        actor: actor.id,
        occurredAt,
        requestId: requestIdFrom(req.headers),
        result: 'success',
        targetId: doc.id,
        targetType: 'gallery-work',
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
