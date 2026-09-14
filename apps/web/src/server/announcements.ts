import {
  apiErrorSchema,
  publicAnnouncementDetailSchema,
  publicAnnouncementPageSchema,
  type PublicAnnouncementDetail,
  type PublicAnnouncementPage,
} from '@ascnucc/contracts'
import { cache } from 'react'

const timeoutMs = 8_000

export class AnnouncementNotFoundError extends Error {
  constructor() {
    super('Announcement not found')
    this.name = 'AnnouncementNotFoundError'
  }
}

export class AnnouncementUnavailableError extends Error {
  constructor(public readonly requestId = crypto.randomUUID()) {
    super('Announcement service unavailable')
    this.name = 'AnnouncementUnavailableError'
  }
}

async function requestCms(path: string): Promise<unknown> {
  const baseUrl = process.env.CMS_API_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new AnnouncementUnavailableError()

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new AnnouncementUnavailableError()
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AnnouncementUnavailableError(
      response.headers.get('x-request-id') ?? undefined,
    )
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body)
    if (
      response.status === 404 &&
      parsedError.success &&
      parsedError.data.code === 'NOT_FOUND'
    ) {
      throw new AnnouncementNotFoundError()
    }
    throw new AnnouncementUnavailableError(
      parsedError.success
        ? parsedError.data.requestId
        : (response.headers.get('x-request-id') ?? undefined),
    )
  }

  return body
}

export async function getPublicAnnouncementPage(
  page: number,
  pageSize = 10,
): Promise<PublicAnnouncementPage> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const result = publicAnnouncementPageSchema.safeParse(
    await requestCms(`/api/v1/content/announcements?${query}`),
  )
  if (!result.success) throw new AnnouncementUnavailableError()
  return result.data
}

export async function getPublicAnnouncement(
  slug: string,
): Promise<PublicAnnouncementDetail> {
  let normalizedSlug: string
  try {
    normalizedSlug = decodeURIComponent(slug)
  } catch {
    throw new AnnouncementNotFoundError()
  }

  const result = publicAnnouncementDetailSchema.safeParse(
    await requestCms(
      `/api/v1/content/announcements/${encodeURIComponent(normalizedSlug)}`,
    ),
  )
  if (!result.success) throw new AnnouncementUnavailableError()
  return result.data
}

export type AnnouncementDetailOutcome =
  | { data: PublicAnnouncementDetail; error?: never }
  | {
      data?: never
      error: AnnouncementNotFoundError | AnnouncementUnavailableError
    }

type AnnouncementDetailLoader = (
  slug: string,
) => Promise<AnnouncementDetailOutcome>
type AnnouncementDetailMemoizer = (
  loader: AnnouncementDetailLoader,
) => AnnouncementDetailLoader

export function createAnnouncementDetailLoader(
  fetchAnnouncement: (
    slug: string,
  ) => Promise<PublicAnnouncementDetail> = getPublicAnnouncement,
  memoize: AnnouncementDetailMemoizer = cache,
): AnnouncementDetailLoader {
  return memoize(async (slug) => {
    try {
      return { data: await fetchAnnouncement(slug) }
    } catch (error) {
      if (
        !(
          error instanceof AnnouncementNotFoundError ||
          error instanceof AnnouncementUnavailableError
        )
      ) {
        throw error
      }
      return { error }
    }
  })
}

export const loadPublicAnnouncementDetail = createAnnouncementDetailLoader()
