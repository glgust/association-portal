import {
  membershipIntakeApplicationResultSchema,
  membershipIntakeApplicationSubmitSchema,
} from '@ascnucc/contracts'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { environment } from '@/config/environment'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { createMemberClaimAuditPort } from '@/modules/recruitment/member-account-claim/adapters'
import { submitMemberIntake } from '@/modules/recruitment/member-account-claim/use-cases/submit-intake'
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
    const command = membershipIntakeApplicationSubmitSchema.parse(
      await request.json(),
    )
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await submitMemberIntake(payload, req, {
      audit: createMemberClaimAuditPort(payload),
      command: {
        contacts: command.contacts,
        major: command.major,
        membershipIdentity: command.membershipIdentity,
        name: command.fullName,
        privacyPurposeConfirmed: command.privacyPurposeAccepted,
        studentNumber: command.studentNumber,
      },
      fingerprintKey: environment.payloadSecret,
      idempotencyKey,
      now: new Date(),
      requestId,
    })
    return NextResponse.json(
      membershipIntakeApplicationResultSchema.parse({
        intakeApplicationId: result.intakeId,
        requestId: result.requestId,
        status: result.status,
        statusReceipt: result.statusReceipt,
        statusReceiptNotice: result.statusReceiptNotice,
        submittedAt: result.submittedAt,
      }),
      { headers: noStoreHeaders(result.requestId), status: 201 },
    )
  } catch (error) {
    return membershipErrorResponse(error, requestId)
  }
}
