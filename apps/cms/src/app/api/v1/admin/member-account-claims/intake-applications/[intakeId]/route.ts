import { getPayload } from 'payload'
import { z } from 'zod'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { getMemberIntakeDetail } from '@/modules/recruitment/member-account-claim/admin/queries'

import {
  adminMembershipError,
  adminMembershipJson,
} from '@/app/api/v1/admin/member-account-claims/_shared'

const pathSchema = z.object({ intakeId: z.string().uuid() }).strict()

export async function GET(
  request: Request,
  context: { params: Promise<{ intakeId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { intakeId } = pathSchema.parse(await context.params)
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    return adminMembershipJson(
      await getMemberIntakeDetail(payload, req, intakeId, new Date()),
      requestId,
    )
  } catch (error) {
    return adminMembershipError(error, requestId)
  }
}
