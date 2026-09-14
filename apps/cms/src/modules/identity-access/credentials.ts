import { pbkdf2, randomInt, timingSafeEqual } from 'node:crypto'

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function generateTemporaryCredential(): string {
  const symbols = Array.from(
    { length: 26 },
    () => alphabet[randomInt(alphabet.length)],
  )
  return [
    symbols.slice(0, 5).join(''),
    symbols.slice(5, 10).join(''),
    symbols.slice(10, 15).join(''),
    symbols.slice(15, 20).join(''),
    symbols.slice(20).join(''),
  ].join('-')
}

export function verifyPayloadPassword(
  candidate: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    pbkdf2(candidate, salt, 25_000, 512, 'sha256', (error, derived) => {
      if (error) return reject(error)
      const expected = Buffer.from(expectedHash, 'hex')
      resolve(
        expected.length === derived.length &&
          timingSafeEqual(expected, derived),
      )
    })
  })
}
