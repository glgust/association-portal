import {
  apiErrorSchema,
  publicAssociationPageSchema,
  type PublicAssociationAboutPage,
  type PublicAssociationContactPage,
  type PublicAssociationHomePage,
} from '@ascnucc/contracts'

import {
  AssociationPageNotFoundError,
  AssociationPageUnavailableError,
} from './association-page-errors'

export {
  AssociationPageNotFoundError,
  AssociationPageUnavailableError,
} from './association-page-errors'

const timeoutMs = 8_000

async function request(pageKey: 'home' | 'about' | 'contact') {
  const baseUrl = process.env.CMS_API_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new AssociationPageUnavailableError()
  let response: Response
  try {
    response = await fetch(
      `${baseUrl}/api/v1/content/association-pages/${pageKey}`,
      {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      },
    )
  } catch {
    throw new AssociationPageUnavailableError()
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AssociationPageUnavailableError(
      response.headers.get('x-request-id') ?? undefined,
    )
  }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body)
    if (
      response.status === 404 &&
      parsed.success &&
      parsed.data.code === 'NOT_FOUND'
    )
      throw new AssociationPageNotFoundError()
    throw new AssociationPageUnavailableError(
      parsed.success
        ? parsed.data.requestId
        : (response.headers.get('x-request-id') ?? undefined),
    )
  }
  const parsed = publicAssociationPageSchema.safeParse(body)
  if (!parsed.success || parsed.data.pageKey !== pageKey)
    throw new AssociationPageUnavailableError()
  return parsed.data
}

export async function getPublicHomePage(): Promise<PublicAssociationHomePage> {
  const page = await request('home')
  if (page.pageKey !== 'home') throw new AssociationPageUnavailableError()
  return page
}
export async function getPublicAboutPage(): Promise<PublicAssociationAboutPage> {
  const page = await request('about')
  if (page.pageKey !== 'about') throw new AssociationPageUnavailableError()
  return page
}
export async function getPublicContactPage(): Promise<PublicAssociationContactPage> {
  const page = await request('contact')
  if (page.pageKey !== 'contact') throw new AssociationPageUnavailableError()
  return page
}
