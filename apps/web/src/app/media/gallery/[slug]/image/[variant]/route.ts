import {
  apiErrorSchema,
  publicGalleryImageVariantSchema,
} from '@ascnucc/contracts'

const timeoutMs = 8_000
const unavailableHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; variant: string }> },
): Promise<Response> {
  const { slug, variant: rawVariant } = await params
  const variant = publicGalleryImageVariantSchema.safeParse(rawVariant)
  if (!variant.success) return safeError(404, 'NOT_FOUND')

  const baseUrl = process.env.CMS_API_URL?.replace(/\/$/, '')
  if (!baseUrl) return safeError(503, 'SERVICE_UNAVAILABLE')

  const ifNoneMatch = request.headers.get('if-none-match')
  const headers: Record<string, string> = { accept: 'image/webp' }
  if (
    ifNoneMatch &&
    ifNoneMatch.length <= 200 &&
    /^[\x20-\x7e]+$/.test(ifNoneMatch)
  ) {
    headers['if-none-match'] = ifNoneMatch
  }

  let response: Response
  try {
    response = await fetch(
      `${baseUrl}/api/v1/content/gallery/${encodeURIComponent(slug)}/image/${variant.data}`,
      {
        cache: 'no-store',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      },
    )
  } catch {
    return safeError(503, 'SERVICE_UNAVAILABLE')
  }

  if (response.status === 304) {
    const etag = response.headers.get('etag')
    if (!etag) return safeError(503, 'SERVICE_UNAVAILABLE')
    return new Response(null, {
      headers: {
        'cache-control': 'max-age=0, must-revalidate',
        etag,
        'x-content-type-options': 'nosniff',
      },
      status: 304,
    })
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(await safeJson(response))
    const isNotFound =
      response.status === 404 &&
      parsed.success &&
      parsed.data.code === 'NOT_FOUND'
    return safeError(
      isNotFound ? 404 : 503,
      isNotFound ? 'NOT_FOUND' : 'SERVICE_UNAVAILABLE',
      parsed.success
        ? parsed.data.requestId
        : (response.headers.get('x-request-id') ?? undefined),
    )
  }

  const contentType = response.headers.get('content-type')
  const contentLength = response.headers.get('content-length')
  const etag = response.headers.get('etag')
  if (
    contentType !== 'image/webp' ||
    contentLength === null ||
    !/^\d+$/.test(contentLength) ||
    etag === null
  ) {
    return safeError(503, 'SERVICE_UNAVAILABLE')
  }

  return new Response(response.body, {
    headers: {
      'cache-control': 'max-age=0, must-revalidate',
      'content-length': contentLength,
      'content-type': contentType,
      etag,
      'x-content-type-options': 'nosniff',
    },
    status: 200,
  })
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function safeError(
  status: 404 | 503,
  code: 'NOT_FOUND' | 'SERVICE_UNAVAILABLE',
  requestId = crypto.randomUUID(),
): Response {
  return Response.json(
    {
      code,
      message:
        code === 'NOT_FOUND'
          ? 'Gallery image not found'
          : 'Gallery image unavailable',
      requestId,
    },
    { headers: unavailableHeaders, status },
  )
}
