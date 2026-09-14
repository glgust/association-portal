import {
  membershipStatusQuerySchema,
  membershipStatusResultSchema,
} from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { environment } from '@/config/environment'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { createMemberClaimIdentityPort } from '@/modules/recruitment/member-account-claim/adapters'
import { queryMembershipStatus } from '@/modules/recruitment/member-account-claim/use-cases/query-status'
import config from '@/payload.config'

import { membershipErrorResponse, noStoreHeaders } from '../../_shared'

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const command = membershipStatusQuerySchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await queryMembershipStatus(payload, req, {
      identity: createMemberClaimIdentityPort(payload),
      now: new Date(),
      receipt: command.statusReceipt,
      receiptKey: environment.payloadSecret,
      requestId,
    })
    return NextResponse.json(membershipStatusResultSchema.parse(result), {
      headers: noStoreHeaders(requestId),
    })
  } catch (error) {
    return membershipErrorResponse(error, requestId)
  }
}
