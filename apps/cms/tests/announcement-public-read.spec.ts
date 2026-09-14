import { describe, expect, it } from 'vitest'

import { publicAnnouncementQuerySchema } from '@/modules/content/announcements/public-read'

describe('public announcement query', () => {
  it('applies stable pagination defaults', () => {
    expect(publicAnnouncementQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    })
  })

  it('accepts positive decimal integers within the page-size cap', () => {
    expect(
      publicAnnouncementQuerySchema.parse({ page: '12', pageSize: '50' }),
    ).toEqual({ page: 12, pageSize: 50 })
  })

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: ' 1' },
    { pageSize: '51' },
    { pageSize: '0' },
    { pageSize: '1.5' },
    { extra: 'field' },
    { page: '9007199254740992' },
    { pageSize: '9007199254740992' },
    { page: '9'.repeat(400) },
    { pageSize: '9'.repeat(400) },
  ])('rejects invalid or unknown query input: %o', (query) => {
    expect(publicAnnouncementQuerySchema.safeParse(query).success).toBe(false)
  })
})
