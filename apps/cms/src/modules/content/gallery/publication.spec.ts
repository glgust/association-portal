import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import {
  isCompleteMediaAsset,
  normalizeGalleryText,
  normalizeOptionalGalleryText,
  publicAuthorNameFor,
} from './publication'

const prefix = '11111111-2222-4333-8444-555555555555'
const variant = (name: 'detail' | 'display' | 'list' | 'thumbnail') => ({
  byteSize: 128,
  height: 600,
  mimeType: 'image/webp',
  objectKey: `media/${prefix}/${name}.webp`,
  sha256: 'a'.repeat(64),
  width: 900,
})

describe('Gallery publication rules', () => {
  it('normalizes safe single-line text with NFKC', () => {
    assert.equal(normalizeGalleryText('  Ａ星空  ', 120), 'A星空')
    assert.equal(normalizeGalleryText('一行\n二行', 120), null)
    assert.equal(normalizeGalleryText('一行\u0085二行', 120), null)
    assert.equal(normalizeGalleryText('一行\u2028二行', 120), null)
    assert.equal(normalizeGalleryText('一行\u2029二行', 120), null)
    assert.equal(normalizeOptionalGalleryText('   ', 100), null)
    assert.equal(normalizeOptionalGalleryText('x'.repeat(101), 100), undefined)
  })

  it('uses a safe pen name or display-name snapshot', () => {
    const author = {
      displayName: '虚构作者',
      studentNumber: '209900000001',
      username: 'fictional-author',
    }
    assert.equal(publicAuthorNameFor(author, null), '虚构作者')
    assert.equal(publicAuthorNameFor(author, '星野'), '星野')
    assert.equal(publicAuthorNameFor(author, 'fictional-author'), null)
    assert.equal(publicAuthorNameFor(author, '作者 fictional-author'), null)
    assert.equal(publicAuthorNameFor(author, '作者 FICTIONAL-AUTHOR'), null)
    assert.equal(
      publicAuthorNameFor(author, '作者 ２０９９０００００００１'),
      null,
    )
    assert.equal(publicAuthorNameFor(author, '作者 209900000001'), null)
  })

  it('requires every immutable WebP variant and its planned key', () => {
    const complete = {
      ...variant('display'),
      detail: variant('detail'),
      display: variant('display'),
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      list: variant('list'),
      objectPrefix: prefix,
      thumbnail: variant('thumbnail'),
    }
    assert.equal(isCompleteMediaAsset(complete), true)
    assert.equal(
      isCompleteMediaAsset({
        ...complete,
        thumbnail: { ...complete.thumbnail, objectKey: 'public/image.webp' },
      }),
      false,
    )
  })
})
