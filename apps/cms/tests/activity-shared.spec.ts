import { describe, expect, it } from 'vitest'

import { createActivitySlug } from '@/modules/content/activities/slug'
import { publicContentPaginationQuerySchema } from '@/modules/content/shared/pagination'

describe('activity shared primitives', () => {
  it('keeps the approved activity slug format and fallback', () => {
    expect(createActivitySlug('  ＡＳＣＮＵＣＣ 观星活动  ')).toMatch(
      /^ascnucc-观星活动-[0-9a-f]{8}$/,
    )
    expect(createActivitySlug(' --- ')).toMatch(/^activity-[0-9a-f]{8}$/)
  })

  it('uses the exact strict public pagination schema', () => {
    expect(publicContentPaginationQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    })
    expect(
      publicContentPaginationQuerySchema.parse({ page: '2', pageSize: '50' }),
    ).toEqual({ page: 2, pageSize: 50 })
    expect(
      publicContentPaginationQuerySchema.safeParse({ page: '01' }).success,
    ).toBe(false)
    expect(
      publicContentPaginationQuerySchema.safeParse({ status: 'ongoing' })
        .success,
    ).toBe(false)
  })
})
