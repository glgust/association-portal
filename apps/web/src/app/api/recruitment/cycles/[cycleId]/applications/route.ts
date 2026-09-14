import { forwardResponse, proxyToCms } from '@/server/cms-proxy'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await params
  const headers = new Headers({ 'content-type': 'application/json' })
  for (const name of ['idempotency-key', 'x-request-id']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  return forwardResponse(
    await proxyToCms(
      `/api/v1/recruitment/cycles/${encodeURIComponent(cycleId)}/applications`,
      {
        body: await request.text(),
        headers,
        method: 'POST',
      },
    ),
  )
}
