import {
  apiErrorSchema,
  publicActivityDetailSchema,
  publicActivityPageSchema,
  type PublicActivityDetail,
  type PublicActivityPage,
} from '@ascnucc/contracts'
import { cache } from 'react'

const timeoutMs = 8_000

export class ActivityNotFoundError extends Error {
  constructor() {
    super('Activity not found')
    this.name = 'ActivityNotFoundError'
  }
}

export class ActivityUnavailableError extends Error {
  constructor(public readonly requestId = crypto.randomUUID()) {
    super('Activity service unavailable')
    this.name = 'ActivityUnavailableError'
  }
}

async function requestCms(
  path: string,
  allowControlledNotFound = false,
): Promise<unknown> {
  const baseUrl = process.env.CMS_API_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new ActivityUnavailableError()

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new ActivityUnavailableError()
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ActivityUnavailableError(
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
      throw new ActivityNotFoundError()
    }
    throw new ActivityUnavailableError(
      parsedError.success
        ? parsedError.data.requestId
        : (response.headers.get('x-request-id') ?? undefined),
    )
  }

  return body
}

export async function getPublicActivityPage(
  page: number,
  pageSize = 10,
): Promise<PublicActivityPage> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const result = publicActivityPageSchema.safeParse(
    await requestCms(`/api/v1/content/activities?${query}`),
  )
  if (!result.success) throw new ActivityUnavailableError()
  return result.data
}

export async function getPublicActivity(
  slug: string,
): Promise<PublicActivityDetail> {
  let normalizedSlug: string
  try {
    normalizedSlug = decodeURIComponent(slug)
  } catch {
    throw new ActivityNotFoundError()
  }

  const result = publicActivityDetailSchema.safeParse(
    await requestCms(
      `/api/v1/content/activities/${encodeURIComponent(normalizedSlug)}`,
      true,
    ),
  )
  if (!result.success) throw new ActivityUnavailableError()
  return result.data
}

export type ActivityDetailOutcome =
  | { data: PublicActivityDetail; error?: never }
  | { data?: never; error: ActivityNotFoundError | ActivityUnavailableError }

type ActivityDetailOutcomeLoader = (
  slug: string,
) => Promise<ActivityDetailOutcome>
type ActivityDetailMemoizer = (
  loader: ActivityDetailOutcomeLoader,
) => ActivityDetailOutcomeLoader

export function createActivityDetailLoader(
  fetchActivity: (
    slug: string,
  ) => Promise<PublicActivityDetail> = getPublicActivity,
  memoize: ActivityDetailMemoizer = cache,
): ActivityDetailOutcomeLoader {
  return memoize(async (slug) => {
    try {
      return { data: await fetchActivity(slug) }
    } catch (error) {
      if (
        !(
          error instanceof ActivityNotFoundError ||
          error instanceof ActivityUnavailableError
        )
      ) {
        throw error
      }
      return { error }
    }
  })
}

export const loadPublicActivityDetail = createActivityDetailLoader()
