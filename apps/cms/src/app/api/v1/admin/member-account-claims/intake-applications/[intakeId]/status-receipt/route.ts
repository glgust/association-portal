import { getPayload } from 'payload'
import { z } from 'zod'

import {
  adminMembershipError,
  adminMembershipJson,
} from '@/app/api/v1/admin/member-account-claims/_shared'
import { environment } from '@/config/environment'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { createMemberClaimAuditPort } from '@/modules/recruitment/member-account-claim/adapters'
import { statusReceiptResultSchema } from '@/modules/recruitment/member-account-claim/admin/schemas'
import { statusReceiptMutationSchema } from '@/modules/recruitment/member-account-claim/schemas'
import { reissueMembershipStatusReceipt } from '@/modules/recruitment/member-account-claim/use-cases/status-admin'
import config from '@/payload.config'

const pathSchema = z.object({ intakeId: z.string().uuid() }).strict()

export async function POST(
  request: Request,
  context: { params: Promise<{ intakeId: string }> },
) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { intakeId } = pathSchema.parse(await context.params)
    const command = statusReceiptMutationSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await reissueMembershipStatusReceipt(
      payload,
      req,
      'intake',
      intakeId,
      {
        audit: createMemberClaimAuditPort(payload),
        command,
        now: new Date(),
        receiptKey: environment.payloadSecret,
        requestId,
      },
    )
    return adminMembershipJson(
      statusReceiptResultSchema.parse(result),
      requestId,
    )
  } catch (error) {
    return adminMembershipError(error, requestId)
  }
}
