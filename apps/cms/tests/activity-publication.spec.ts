import { describe, expect, it } from 'vitest'

import { validateActivityForPublication } from '@/modules/content/activities/publication'

const body = {
  root: {
    children: [
      {
        children: [{ format: 0, text: '虚构活动正文', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'root',
  },
}

const validTemporary = {
  activityType: 'temporary',
  body,
  cancellationNote: null,
  endsAt: '2026-07-20T22:00:00+08:00',
  isCancelled: false,
  location: '虚构校园广场',
  scheduleText: null,
  startsAt: '2026-07-20T20:00:00+08:00',
  summary: null,
  title: '夏季观测夜',
}

describe('activity publication validation', () => {
  it('accepts valid temporary and standing public versions', () => {
    expect(validateActivityForPublication(validTemporary)).toEqual([])
    expect(
      validateActivityForPublication({
        ...validTemporary,
        activityType: 'standing',
        endsAt: null,
        scheduleText: '每周五 19:30–21:00',
        startsAt: null,
      }),
    ).toEqual([])
  })

  it.each([
    [{ location: '   ' }, 'location'],
    [{ endsAt: '2026-07-20T19:00:00+08:00' }, 'endsAt'],
    [{ scheduleText: '不应出现' }, 'scheduleText'],
    [{ isCancelled: true, cancellationNote: '   ' }, 'cancellationNote'],
    [{ cancellationNote: '未取消不应有说明' }, 'cancellationNote'],
    [
      { body: { root: { children: [{ type: 'image' }], type: 'root' } } },
      'body',
    ],
  ])('rejects an invalid published activity at %s', (change, path) => {
    expect(
      validateActivityForPublication({ ...validTemporary, ...change }).some(
        (issue) => issue.path === path,
      ),
    ).toBe(true)
  })

  it('rejects temporary/standing branch leakage', () => {
    const standing = {
      ...validTemporary,
      activityType: 'standing',
      scheduleText: '每周五',
    }
    const paths = validateActivityForPublication(standing).map(
      ({ path }) => path,
    )
    expect(paths).toContain('startsAt')
    expect(paths).toContain('endsAt')
  })

  it('accepts CR/LF in multiline fields but rejects them in single-line fields', () => {
    const multiline = {
      ...validTemporary,
      activityType: 'standing',
      cancellationNote: '第一行\r\n第二行\r第三行',
      endsAt: null,
      isCancelled: true,
      scheduleText: '周五\n周六',
      startsAt: null,
      summary: '摘要一\r\n摘要二',
    }
    expect(validateActivityForPublication(multiline)).toEqual([])
    for (const field of ['title', 'location'] as const) {
      expect(
        validateActivityForPublication({
          ...validTemporary,
          [field]: '单行\n字段',
        }).some((issue) => issue.path === field),
      ).toBe(true)
    }
  })

  it.each(['\u0000', '\t', '\u000b', '\u000c', '\u001f', '\u007f'])(
    'rejects forbidden multiline control character %s',
    (control) => {
      expect(
        validateActivityForPublication({
          ...validTemporary,
          summary: `摘要${control}内容`,
        }).some((issue) => issue.path === 'summary'),
      ).toBe(true)
    },
  )
})
