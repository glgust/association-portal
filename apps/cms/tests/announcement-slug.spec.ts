import { describe, expect, it } from 'vitest'

import { createAnnouncementSlug } from '@/modules/content/announcements/slug'

describe('announcement slug', () => {
  it('normalizes Unicode safely while preserving letters and numbers', () => {
    const slug = createAnnouncementSlug(
      '  ＡＳＣＮＵＣＣ 观星／公告 ２０２６!!  ',
    )

    expect(slug).toMatch(/^ascnucc-观星-公告-2026-[0-9a-f]{8}$/)
  })

  it('uses a stable fallback base when the title has no letters or numbers', () => {
    expect(createAnnouncementSlug('  --- !!!  ')).toMatch(
      /^announcement-[0-9a-f]{8}$/,
    )
  })

  it('adds a random eight-hex suffix for otherwise identical titles', () => {
    const first = createAnnouncementSlug('重复标题')
    const second = createAnnouncementSlug('重复标题')

    expect(first).toMatch(/^重复标题-[0-9a-f]{8}$/)
    expect(second).toMatch(/^重复标题-[0-9a-f]{8}$/)
    expect(second).not.toBe(first)
  })

  it('caps the normalized base at 80 characters without a trailing separator', () => {
    const slug = createAnnouncementSlug(`${'a'.repeat(79)}---${'b'.repeat(20)}`)
    const match = slug.match(/^(.*)-([0-9a-f]{8})$/u)

    expect(match).not.toBeNull()
    expect(match?.[1]).toHaveLength(79)
    expect(match?.[1]).not.toMatch(/-$/)
    expect(slug.length).toBeLessThanOrEqual(89)
  })
})
