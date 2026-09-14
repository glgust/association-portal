import { describe, expect, it } from 'vitest'

import {
  normalizeNewsText,
  validateNewsForPublication,
} from '@/modules/content/news/publication'

const body = {
  root: {
    children: [
      {
        children: [{ format: 0, text: '虚构新闻正文', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'root',
  },
}

describe('News publication rules', () => {
  it('normalizes title and optional summary with NFKC and trim', () => {
    expect(normalizeNewsText('  ＡＳＣＮＵＣＣ 新闻  ', 'title')).toBe(
      'ASCNUCC 新闻',
    )
    expect(normalizeNewsText('   ', 'summary')).toBeNull()
  })

  it.each([
    ['标题\n换行', 'title'],
    ['摘要\r换行', 'summary'],
    [`标题\u0000控制`, 'title'],
    ['Ａ'.repeat(121), 'title'],
    ['摘'.repeat(241), 'summary'],
  ] as const)('rejects invalid %s', (value, path) => {
    expect(normalizeNewsText(value, path)).toBeNull()
  })

  it('accepts a complete, meaningful public version', () => {
    expect(
      validateNewsForPublication({
        body,
        summary: null,
        title: '虚构新闻标题',
      }),
    ).toEqual([])
  })

  it.each([
    [{ title: ' ' }, 'title'],
    [{ summary: '摘要\n换行' }, 'summary'],
    [{ body: { root: { children: [], type: 'root' } } }, 'body'],
    [
      { body: { root: { children: [{ type: 'upload' }], type: 'root' } } },
      'body',
    ],
  ])('rejects an invalid published News field at %s', (change, path) => {
    expect(
      validateNewsForPublication({
        body,
        summary: null,
        title: '虚构新闻标题',
        ...change,
      }).some((issue) => issue.path === path),
    ).toBe(true)
  })
})
