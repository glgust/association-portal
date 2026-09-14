import {
  publicAssociationAboutPageSchema,
  publicAssociationContactPageSchema,
  publicAssociationHomePageSchema,
  type PublicAssociationPage,
} from '@ascnucc/contracts'
import type { Payload, PayloadRequest } from 'payload'

import { BusinessError } from '@/modules/shared/business-error'
import { toPublicRichText } from '@/modules/content/shared/public-rich-text'

import {
  isAssociationPageKey,
  type AssociationContact,
  type AssociationPageKey,
  validateAndMapPublicContacts,
} from './domain'

type PageDocument = {
  body?: unknown
  contacts?: AssociationContact[]
  lead?: null | string
  pageKey?: AssociationPageKey
  seoSummary?: null | string
  title?: string
}

function publicValidationFailed(): never {
  throw new Error('Published association page failed public validation')
}

export async function getPublicAssociationPage(
  payload: Payload,
  req: PayloadRequest,
  pageKey: string,
): Promise<PublicAssociationPage> {
  if (!isAssociationPageKey(pageKey)) {
    throw new BusinessError('NOT_FOUND', 'Association page not found', 404)
  }
  const result = await payload.find({
    collection: 'association-pages',
    draft: false,
    limit: 1,
    overrideAccess: true,
    req,
    select: {
      body: true,
      contacts: true,
      lead: true,
      pageKey: true,
      seoSummary: true,
      title: true,
    },
    where: {
      and: [
        { pageKey: { equals: pageKey } },
        { _status: { equals: 'published' } },
      ],
    },
  })
  const page = result.docs[0] as PageDocument | undefined
  if (!page)
    throw new BusinessError('NOT_FOUND', 'Association page not found', 404)
  if (page.pageKey !== pageKey) publicValidationFailed()
  const common = {
    body: toPublicRichText(page.body),
    seoSummary: page.seoSummary ?? null,
    title: page.title,
    version: 1 as const,
  }
  if (pageKey === 'home') {
    const parsed = publicAssociationHomePageSchema.safeParse({
      ...common,
      lead: page.lead ?? null,
      pageKey,
    })
    return parsed.success ? parsed.data : publicValidationFailed()
  }
  if (pageKey === 'about') {
    const parsed = publicAssociationAboutPageSchema.safeParse({
      ...common,
      pageKey,
    })
    return parsed.success ? parsed.data : publicValidationFailed()
  }
  const parsed = publicAssociationContactPageSchema.safeParse({
    ...common,
    contacts: validateAndMapPublicContacts(page.contacts),
    pageKey,
  })
  return parsed.success ? parsed.data : publicValidationFailed()
}
