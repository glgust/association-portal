const timeoutMs = 8_000

export async function proxyToCms(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const baseUrl = process.env.CMS_API_URL?.replace(/\/$/, '')
  if (!baseUrl) {
    return Response.json(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: 'CMS API is not configured',
        requestId: crypto.randomUUID(),
      },
      { status: 503 },
    )
  }

  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return Response.json(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: 'CMS API is unavailable',
        requestId: crypto.randomUUID(),
      },
      { status: 503 },
    )
  }
}

export async function forwardResponse(response: Response): Promise<Response> {
  const body = await response.arrayBuffer()
  const headers = new Headers()
  headers.set(
    'content-type',
    response.headers.get('content-type') ?? 'application/json',
  )
  const requestId = response.headers.get('x-request-id')
  if (requestId) headers.set('x-request-id', requestId)
  return new Response(body, { headers, status: response.status })
}
