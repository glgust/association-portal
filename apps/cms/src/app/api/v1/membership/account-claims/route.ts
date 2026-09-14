import {
  membershipAccountClaimResultSchema,
  membershipAccountClaimSubmitSchema,
} from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { environment } from '@/config/environment'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import {
  createMemberClaimAuditPort,
  createMemberClaimIdentityPort,
} from '@/modules/recruitment/member-account-claim/adapters'
import { submitAccountClaim } from '@/modules/recruitment/member-account-claim/use-cases/submit-claim'
import config from '@/payload.config'

import {
  idempotencyKeyFrom,
  membershipErrorResponse,
  noStoreHeaders,
} from '../_shared'

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const idempotencyKey = idempotencyKeyFrom(request.headers)
    const command = membershipAccountClaimSubmitSchema.parse(
      await request.json(),
    )
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await submitAccountClaim(payload, req, {
      audit: createMemberClaimAuditPort(payload),
      command: {
        contacts: command.contacts,
        major: command.major,
        membershipIdentity: command.membershipIdentity,
        name: command.fullName,
        password: command.password,
        passwordConfirmation: command.passwordConfirmation,
        studentNumber: command.studentNumber,
      },
      fingerprintKey: environment.payloadSecret,
      idempotencyKey,
      identity: createMemberClaimIdentityPort(payload),
      now: new Date(),
      requestId,
    })
    const response =
      result.outcome === 'manualVerificationRequired'
        ? result
        : {
            accountClaimId: result.claimId,
            outcome: result.outcome,
            requestId: result.requestId,
            status: 'pendingReview' as const,
            statusReceipt: result.statusReceipt,
            statusReceiptNotice: result.statusReceiptNotice,
            submittedAt: result.submittedAt,
          }
    return NextResponse.json(
      membershipAccountClaimResultSchema.parse(response),
      {
        headers: noStoreHeaders(result.requestId),
        status: result.outcome === 'pendingReview' ? 201 : 200,
      },
    )
  } catch (error) {
    return membershipErrorResponse(error, requestId)
  }
}
