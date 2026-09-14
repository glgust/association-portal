import { pbkdf2Sync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  generateTemporaryCredential,
  verifyPayloadPassword,
} from '@/modules/identity-access/credentials'

const credentialAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

describe('identity-access credentials', () => {
  it('generates a copyable 130-bit temporary credential in fixed groups', () => {
    const credential = generateTemporaryCredential()
    const symbols = credential.replaceAll('-', '')

    expect(credential).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}){3}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/,
    )
    expect(symbols).toHaveLength(26)
    expect(new Set(credentialAlphabet)).toHaveLength(32)
    expect(
      symbols.split('').every((symbol) => credentialAlphabet.includes(symbol)),
    ).toBe(true)
    expect(
      symbols.length * Math.log2(new Set(credentialAlphabet).size),
    ).toBeGreaterThanOrEqual(130)
  })

  it('uses fresh randomness for each generated temporary credential', () => {
    const credentials = Array.from({ length: 8 }, () =>
      generateTemporaryCredential(),
    )
    expect(new Set(credentials)).toHaveLength(credentials.length)
  })

  it('verifies Payload-compatible PBKDF2 hashes without accepting a wrong password', async () => {
    const password = 'fictional password phrase'
    const salt = 'fictional-test-salt'
    const hash = pbkdf2Sync(password, salt, 25_000, 512, 'sha256').toString(
      'hex',
    )

    await expect(verifyPayloadPassword(password, salt, hash)).resolves.toBe(
      true,
    )
    await expect(
      verifyPayloadPassword('wrong password', salt, hash),
    ).resolves.toBe(false)
    await expect(verifyPayloadPassword(password, salt, '00')).resolves.toBe(
      false,
    )
  })
})
