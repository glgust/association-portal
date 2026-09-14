import { beforeAll, describe, expect, it, vi } from 'vitest'

let GET: typeof import('@/app/api/v1/content/announcements/route').GET

beforeAll(async () => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgres://test:test@127.0.0.1:5432/ascnucc_demo_test',
  )
  vi.stubEnv('PAYLOAD_SECRET', 'route-test-secret-not-for-production')
  const route = await import('@/app/api/v1/content/announcements/route')
  GET = route.GET
}, 30_000)

describe('public announcement list route', () => {
  it.each(['9007199254740992', '9'.repeat(400)])(
    'returns the frozen 400 error for an unsafe page integer: %s',
    async (page) => {
      const response = await GET(
        new Request(
          `http://localhost/api/v1/content/announcements?page=${page}`,
        ),
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        code: 'VALIDATION_FAILED',
      })
    },
  )
})
