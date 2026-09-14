import { beforeAll, describe, expect, it, vi } from 'vitest'

let listNews: typeof import('@/app/api/v1/content/news/route').GET
let getNews: typeof import('@/app/api/v1/content/news/[slug]/route').GET

beforeAll(async () => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgres://test:test@127.0.0.1:5432/ascnucc_demo_test',
  )
  vi.stubEnv('PAYLOAD_SECRET', 'route-test-secret-not-for-production')
  listNews = (await import('@/app/api/v1/content/news/route')).GET
  getNews = (await import('@/app/api/v1/content/news/[slug]/route')).GET
}, 30_000)

describe('public News routes', () => {
  it('returns the frozen validation error for unsafe pagination', async () => {
    const response = await listNews(
      new Request('http://localhost/api/v1/content/news?page=9007199254740992'),
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
  })

  it('returns a controlled not-found for malformed slug encoding', async () => {
    const response = await getNews(
      new Request('http://localhost/api/v1/content/news/%E0%A4%A'),
      { params: Promise.resolve({ slug: '%E0%A4%A' }) },
    )
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND' })
  })
})
