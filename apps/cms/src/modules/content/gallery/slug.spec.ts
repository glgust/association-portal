import { describe, expect, it } from 'vitest'

import { createGallerySlug } from './slug'

describe('Gallery slug generation', () => {
  it('always emits a public-contract-safe ASCII slug', () => {
    expect(createGallerySlug('E2E 虚构星云作品')).toMatch(/^e2e-[a-f0-9]{8}$/)
    expect(createGallerySlug('纯中文作品')).toMatch(
      /^gallery-work-[a-f0-9]{8}$/,
    )
  })
})
