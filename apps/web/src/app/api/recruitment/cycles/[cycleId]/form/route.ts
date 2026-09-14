import { forwardResponse, proxyToCms } from '@/server/cms-proxy'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await params
  return forwardResponse(
    await proxyToCms(
      `/api/v1/recruitment/cycles/${encodeURIComponent(cycleId)}/form`,
    ),
  )
}
