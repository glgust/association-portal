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
  hasMeaningfulPublicText,
  toPublicRichText,
} from '@/modules/content/shared/public-rich-text'

import {
  assignContactIds,
  isAssociationPageKey,
  type AssociationContact,
  validateAssociationContacts,
  validateAndMapPublicContacts,
} from './domain'

type AssociationPageData = {
  _status?: 'draft' | 'published'
  body?: unknown
  contacts?: AssociationContact[]
  createdBy?: unknown
  id: string
  lastEditedBy?: unknown
  lead?: unknown
  pageKey?: unknown
  publishedAt?: null | string
  seoSummary?: unknown
  title?: unknown
}

type PublicationAction = 'publish' | 'unpublish'
const actionKey = 'associationPagePublicationAction'
const timeKey = 'associationPagePublicationTime'

function isDraftRequest(req: PayloadRequest): boolean {
  return req.query.draft === true || req.query.draft === 'true'
}

function invalid(
  path: string,
  message: string,
  req: PayloadRequest,
): ValidationError {
  return new ValidationError({ errors: [{ message, path }], req })
}

async function requireDirectPublish(req: PayloadRequest) {
  const actor = await loadActor(req.payload, req)
  if (
    !actor ||
    !authorize(actor, 'content.directPublish', { type: 'global' }, new Date())
      .allowed
  ) {
    throw new Forbidden(req.t)
  }
  return actor
}

function validOptionalText(value: unknown, max: number): boolean {
  return (
    value == null || (typeof value === 'string' && value.trim().length <= max)
  )
}

function validatePublishedPage(
  data: AssociationPageData,
  req: PayloadRequest,
): void {
  if (
    typeof data.title !== 'string' ||
    !data.title.trim() ||
    data.title.trim().length > 120
  ) {
    throw invalid('title', '标题为必填项，且不能超过 120 个字符。', req)
  }
  if (!validOptionalText(data.seoSummary, 240)) {
    throw invalid('seoSummary', 'SEO 摘要不能超过 240 个字符。', req)
  }
  if (data.pageKey === 'home' && !validOptionalText(data.lead, 240)) {
    throw invalid('lead', '首页引导语不能超过 240 个字符。', req)
  }
  if (data.pageKey !== 'home' && data.lead != null) {
    throw invalid('lead', '只有首页可以设置引导语。', req)
  }
  if (data.pageKey !== 'contact' && (data.contacts?.length ?? 0) > 0) {
    throw invalid('contacts', '只有联系方式页面可以发布联系条目。', req)
  }
  try {
    const body = toPublicRichText(data.body)
    if (!hasMeaningfulPublicText(body)) throw new Error('empty')
  } catch {
    throw invalid('body', '正文包含不支持的内容，或没有有意义的文字。', req)
  }
  if (data.pageKey === 'contact') {
    try {
      validateAndMapPublicContacts(data.contacts)
    } catch {
      throw invalid('contacts', '公开联系方式包含不安全或不完整的内容。', req)
    }
  }
}

export const prepareAssociationPageChange: CollectionBeforeChangeHook<
  AssociationPageData
> = async ({ data, operation, originalDoc, req }) => {
  const actor = await loadActor(req.payload, req)
  if (!actor) throw new Forbidden(req.t)
  const pageKey = data.pageKey ?? originalDoc?.pageKey
  if (!isAssociationPageKey(pageKey)) {
    throw invalid('pageKey', '页面身份只能是首页、关于协会或联系方式。', req)
  }
  if (operation === 'create') {
    const existing = await req.payload.find({
      collection: 'association-pages',
      draft: true,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { pageKey: { equals: pageKey } },
    })
    if (existing.docs.length)
      throw invalid('pageKey', '该固定页面已经存在。', req)
    data.pageKey = pageKey
    data.createdBy = actor.id
  } else {
    if (data.pageKey !== undefined && data.pageKey !== originalDoc?.pageKey) {
      throw invalid('pageKey', '页面身份创建后不可修改。', req)
    }
    data.pageKey = originalDoc?.pageKey
    data.createdBy = originalDoc?.createdBy
  }

  data.lastEditedBy = actor.id
  if (data.contacts !== undefined) {
    try {
      data.contacts = assignContactIds(data.contacts, originalDoc?.contacts)
      validateAssociationContacts(data.contacts)
    } catch {
      throw invalid(
        'contacts',
        '联系方式身份、类型、长度或展示开关不合法。',
        req,
      )
    }
  }
  const effectiveData = {
    ...originalDoc,
    ...data,
    contacts: data.contacts ?? originalDoc?.contacts,
    pageKey,
  } as AssociationPageData
  try {
    validateAssociationContacts(effectiveData.contacts)
  } catch {
    throw invalid('contacts', '联系方式身份、类型、长度或展示开关不合法。', req)
  }

  const isDraftWrite = isDraftRequest(req) && data._status !== 'published'
  if (isDraftWrite) {
    if (operation === 'update') data.publishedAt = originalDoc?.publishedAt
    return data
  }

  await requireDirectPublish(req)
  const isUnpublish = operation === 'update' && data._status === 'draft'
  if (
    isUnpublish &&
    pageKey === 'home' &&
    originalDoc?._status === 'published'
  ) {
    throw invalid('_status', '首页首次发布后不能下线。', req)
  }
  if (isUnpublish) {
    data._status = 'draft'
    data.publishedAt = originalDoc?.publishedAt
  } else {
    validatePublishedPage(effectiveData, req)
    data._status = 'published'
    data.publishedAt = new Date().toISOString()
  }
  req.context[actionKey] = isUnpublish ? 'unpublish' : 'publish'
  req.context[timeKey] = new Date().toISOString()
  return data
}

export const auditAssociationPagePublication: CollectionAfterChangeHook<
  AssociationPageData
> = async ({ doc, req }) => {
  const action = req.context[actionKey] as PublicationAction | undefined
  if (!action) return doc
  const actor = await loadActor(req.payload, req)
  const occurredAt = req.context[timeKey]
  if (!actor || typeof occurredAt !== 'string' || typeof doc.id !== 'string')
    throw new Error('Association page audit context is missing')
  setAuditOperation(
    req.context,
    action === 'publish'
      ? auditOperations.publishAssociationPage
      : auditOperations.unpublishAssociationPage,
  )
  await req.payload.create({
    collection: 'audit-events',
    data: {
      action: `content.association-page.${action === 'publish' ? 'published' : 'unpublished'}`,
      actor: actor.id,
      occurredAt,
      requestId: requestIdFrom(req.headers),
      result: 'success',
      targetId: doc.id,
      targetType: 'association-page',
    },
    overrideAccess: false,
    req,
  })
  delete req.context[actionKey]
  delete req.context[timeKey]
  return doc
}
