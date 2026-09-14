import { createHmac, timingSafeEqual } from 'node:crypto'

const receiptDomain = 'ascnucc:membership-status-receipt:v1'

export type StatusReceiptKind = 'claim' | 'intake'

export type StatusReceiptPayload = {
  id: string
  issuedAt: string
  kind: StatusReceiptKind
  version: number
}

function receiptKey(secret: string | Uint8Array): Buffer {
  return createHmac('sha256', secret).update(`${receiptDomain}:key`).digest()
}

function signingInput(payload: StatusReceiptPayload): string {
  return [
    receiptDomain,
    payload.kind,
    payload.id,
    String(payload.version),
    payload.issuedAt,
  ].join('|')
}

function signature(
  secret: string | Uint8Array,
  payload: StatusReceiptPayload,
): Buffer {
  return createHmac('sha256', receiptKey(secret))
    .update(signingInput(payload))
    .digest()
}

export function issueStatusReceipt(
  secret: string | Uint8Array,
  payload: StatusReceiptPayload,
): string {
  const body = Buffer.from(
    JSON.stringify({
      i: payload.id,
      k: payload.kind,
      t: payload.issuedAt,
      v: payload.version,
    }),
  ).toString('base64url')
  return `v1.${body}.${signature(secret, payload).toString('base64url')}`
}

export function verifyStatusReceipt(
  secret: string | Uint8Array,
  receipt: string,
): StatusReceiptPayload | null {
  const parts = receipt.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  try {
    const value = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    if (
      !value ||
      !['claim', 'intake'].includes(String(value.k)) ||
      typeof value.i !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(value.i) ||
      typeof value.t !== 'string' ||
      !Number.isInteger(value.v) ||
      Number(value.v) < 1
    ) {
      return null
    }
    const payload: StatusReceiptPayload = {
      id: value.i,
      issuedAt: value.t,
      kind: value.k as StatusReceiptKind,
      version: Number(value.v),
    }
    if (!Number.isFinite(new Date(payload.issuedAt).getTime())) return null
    const supplied = Buffer.from(parts[2]!, 'base64url')
    const expected = signature(secret, payload)
    if (supplied.length !== expected.length) return null
    return timingSafeEqual(supplied, expected) ? payload : null
  } catch {
    return null
  }
}
