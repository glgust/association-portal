import { describe, expect, it } from 'vitest'

import { publicNewsQuerySchema } from '@/modules/content/news/public-read'

describe('public News query', () => {
  it('applies the frozen pagination defaults', () => {
    expect(publicNewsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 })
  })

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: ' 1' },
    { pageSize: '0' },
    { pageSize: '51' },
    { extra: 'field' },
    { page: '9007199254740992' },
    { pageSize: '9'.repeat(400) },
  ])('rejects invalid or unknown query input: %o', (query) => {
    expect(publicNewsQuerySchema.safeParse(query).success).toBe(false)
  })
})
