import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import {
  accountListResultSchema,
  temporaryCredentialResultSchema,
} from '@/modules/identity-access/dto'
import { createAccountSchema } from '@/modules/identity-access/schemas'
import {
  createAccount,
  listAccounts,
} from '@/modules/identity-access/use-cases/accounts'

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await listAccounts(payload, req, new Date())
    return NextResponse.json(accountListResultSchema.parse(result), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const command = createAccountSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const result = await createAccount(payload, req, command, {
      now: new Date(),
      requestId,
    })
    return NextResponse.json(temporaryCredentialResultSchema.parse(result), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
      status: 201,
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
