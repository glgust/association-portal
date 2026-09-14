import {
  apiErrorSchema,
  publicGalleryDetailSchema,
  publicGalleryImageVariantSchema,
  publicGalleryPageSchema,
  type PublicGalleryDetail,
  type PublicGalleryImageVariant,
  type PublicGalleryListItem,
  type PublicGalleryPage,
} from '@ascnucc/contracts'
import { cache } from 'react'

const timeoutMs = 8_000

export class GalleryNotFoundError extends Error {
  constructor() {
    super('Gallery work not found')
    this.name = 'GalleryNotFoundError'
  }
}

export class GalleryUnavailableError extends Error {
  constructor(public readonly requestId = crypto.randomUUID()) {
    super('Gallery service unavailable')
    this.name = 'GalleryUnavailableError'
  }
}

async function requestCms(
  path: string,
  allowControlledNotFound = false,
): Promise<{ body: unknown; requestId?: string }> {
  const baseUrl = process.env.CMS_API_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new GalleryUnavailableError()

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new GalleryUnavailableError()
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new GalleryUnavailableError(
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
      throw new GalleryNotFoundError()
    }
    throw new GalleryUnavailableError(
      parsedError.success
        ? parsedError.data.requestId
        : (response.headers.get('x-request-id') ?? undefined),
    )
  }

  return {
    body,
    requestId: response.headers.get('x-request-id') ?? undefined,
  }
}

export function galleryImagePath(
  slug: string,
  variant: PublicGalleryImageVariant,
): string {
  return `/media/gallery/${encodeURIComponent(slug)}/image/${variant}`
}

function withSameOriginImages<T extends PublicGalleryListItem>(item: T): T {
  const variants = Object.fromEntries(
    publicGalleryImageVariantSchema.options.map((variant) => [
      variant,
      {
        ...item.image.variants[variant],
        path: galleryImagePath(item.slug, variant),
      },
    ]),
  ) as T['image']['variants']

  return { ...item, image: { ...item.image, variants } }
}

export async function getPublicGalleryPage(
  page: number,
  pageSize = 10,
): Promise<PublicGalleryPage> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const response = await requestCms(`/api/v1/content/gallery?${query}`)
  const result = publicGalleryPageSchema.safeParse(response.body)
  if (!result.success) throw new GalleryUnavailableError(response.requestId)
  return {
    ...result.data,
    items: result.data.items.map(withSameOriginImages),
  }
}

export async function getPublicGalleryWork(
  slug: string,
): Promise<PublicGalleryDetail> {
  let normalizedSlug: string
  try {
    normalizedSlug = decodeURIComponent(slug)
  } catch {
    throw new GalleryNotFoundError()
  }
  const response = await requestCms(
    `/api/v1/content/gallery/${encodeURIComponent(normalizedSlug)}`,
    true,
  )
  const result = publicGalleryDetailSchema.safeParse(response.body)
  if (!result.success) throw new GalleryUnavailableError(response.requestId)
  return withSameOriginImages(result.data)
}

export type GalleryDetailOutcome =
  | { data: PublicGalleryDetail; error?: never }
  | {
      data?: never
      error: GalleryNotFoundError | GalleryUnavailableError
    }

type GalleryDetailLoader = (slug: string) => Promise<GalleryDetailOutcome>
type GalleryDetailMemoizer = (
  loader: GalleryDetailLoader,
) => GalleryDetailLoader

export function createGalleryDetailLoader(
  fetchWork: (
    slug: string,
  ) => Promise<PublicGalleryDetail> = getPublicGalleryWork,
  memoize: GalleryDetailMemoizer = cache,
): GalleryDetailLoader {
  return memoize(async (slug) => {
    try {
      return { data: await fetchWork(slug) }
    } catch (error) {
      if (
        !(
          error instanceof GalleryNotFoundError ||
          error instanceof GalleryUnavailableError
        )
      ) {
        throw error
      }
      return { error }
    }
  })
}

export const loadPublicGalleryDetail = createGalleryDetailLoader()
