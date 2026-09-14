import {
  apiErrorSchema,
  publicNewsDetailSchema,
  publicNewsPageSchema,
  type PublicNewsDetail,
  type PublicNewsPage,
} from '@ascnucc/contracts'
import { cache } from 'react'

const timeoutMs = 8_000

export class NewsNotFoundError extends Error {
  constructor() {
    super('News not found')
    this.name = 'NewsNotFoundError'
  }
}

export class NewsUnavailableError extends Error {
  constructor(public readonly requestId = crypto.randomUUID()) {
    super('News service unavailable')
    this.name = 'NewsUnavailableError'
  }
}

async function requestCms(
  path: string,
  allowControlledNotFound = false,
): Promise<unknown> {
  const baseUrl = process.env.CMS_API_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new NewsUnavailableError()

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new NewsUnavailableError()
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new NewsUnavailableError(
      response.headers.get('x-request-id') ?? undefined,
    )
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body)
    if (
      allowControlledNotFound &&
      response.status === 404 &&
      parsedError.success &&
      parsedError.data.code === 'NOT_FOUND'
    ) {
      throw new NewsNotFoundError()
    }
    throw new NewsUnavailableError(
      parsedError.success
        ? parsedError.data.requestId
        : (response.headers.get('x-request-id') ?? undefined),
    )
  }
  return body
}

export async function getPublicNewsPage(
  page: number,
  pageSize = 10,
): Promise<PublicNewsPage> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const result = publicNewsPageSchema.safeParse(
    await requestCms(`/api/v1/content/news?${query}`),
  )
  if (!result.success) throw new NewsUnavailableError()
  return result.data
}

export async function getPublicNews(slug: string): Promise<PublicNewsDetail> {
  let normalizedSlug: string
  try {
    normalizedSlug = decodeURIComponent(slug)
  } catch {
    throw new NewsNotFoundError()
  }
  const result = publicNewsDetailSchema.safeParse(
    await requestCms(
      `/api/v1/content/news/${encodeURIComponent(normalizedSlug)}`,
      true,
    ),
  )
  if (!result.success) throw new NewsUnavailableError()
  return result.data
}

export type NewsDetailOutcome =
  | { data: PublicNewsDetail; error?: never }
  | { data?: never; error: NewsNotFoundError | NewsUnavailableError }

type NewsDetailLoader = (slug: string) => Promise<NewsDetailOutcome>
type NewsDetailMemoizer = (loader: NewsDetailLoader) => NewsDetailLoader

export function createNewsDetailLoader(
  fetchNews: (slug: string) => Promise<PublicNewsDetail> = getPublicNews,
  memoize: NewsDetailMemoizer = cache,
): NewsDetailLoader {
  return memoize(async (slug) => {
    try {
      return { data: await fetchNews(slug) }
    } catch (error) {
      if (
        !(
          error instanceof NewsNotFoundError ||
          error instanceof NewsUnavailableError
        )
      ) {
        throw error
      }
      return { error }
    }
  })
}

export const loadPublicNewsDetail = createNewsDetailLoader()
