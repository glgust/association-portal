import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import {
  accountDetailSchema,
  accountSummarySchema,
} from '@/modules/identity-access/dto'
import {
  accountPathSchema,
  updateAccountSchema,
} from '@/modules/identity-access/schemas'
import {
  getAccount,
  updateAccount,
} from '@/modules/identity-access/use-cases/accounts'

type Context = { params: Promise<{ accountId: string }> }

export async function GET(request: Request, { params }: Context) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { accountId } = accountPathSchema.parse(await params)
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const account = await getAccount(payload, req, accountId, new Date())
    return NextResponse.json(accountDetailSchema.parse(account), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const requestId = requestIdFrom(request.headers)
  try {
    const { accountId } = accountPathSchema.parse(await params)
    const command = updateAccountSchema.parse(await request.json())
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const account = await updateAccount(payload, req, accountId, command, {
      now: new Date(),
      requestId,
    })
    return NextResponse.json(accountSummarySchema.parse(account), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
