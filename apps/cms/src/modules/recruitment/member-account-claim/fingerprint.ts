import { createHmac } from 'node:crypto'

type FingerprintDomain = 'claim' | 'intake'

export function keyedRequestFingerprint(
  rootKey: string | Uint8Array,
  domain: FingerprintDomain,
  normalizedNonSecretInput: unknown,
): string {
  const domainKey = createHmac('sha256', rootKey)
    .update(`ascnucc:v1:membership-account-claim:${domain}:key`, 'utf8')
    .digest()
  return createHmac('sha256', domainKey)
    .update(JSON.stringify(normalizedNonSecretInput), 'utf8')
    .digest('hex')
}
