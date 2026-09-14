import { describe, expect, it } from 'vitest'

import { createNewsSlug } from '@/modules/content/news/slug'

describe('News slug', () => {
  it('uses the shared normalization and News fallback', () => {
    expect(createNewsSlug('  ＡＳＣＮＵＣＣ 新闻／动态 ２０２６  ')).toMatch(
      /^ascnucc-新闻-动态-2026-[0-9a-f]{8}$/,
    )
    expect(createNewsSlug('---')).toMatch(/^news-[0-9a-f]{8}$/)
  })

  it('keeps otherwise identical titles unique', () => {
    expect(createNewsSlug('重复标题')).not.toBe(createNewsSlug('重复标题'))
  })
})
