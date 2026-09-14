import { describe, expect, it } from 'vitest'

import {
  assertReviewTransition,
  normalizeContacts,
  normalizeMemberName,
  normalizeOptionalMajor,
  normalizeOptionalStudentNumber,
} from '@/modules/recruitment/member-account-claim/domain'

describe('member account claim profile normalization', () => {
  it('normalizes names with NFKC without guessing equivalent identities', () => {
    expect(normalizeMemberName('  Ｇu\u0308nter  ')).toBe('G\u00fcnter')
    expect(() => normalizeMemberName('   ')).toThrow('name')
    expect(() => normalizeMemberName('虚构\n姓名')).toThrow('control')
  })

  it('keeps optional student number and major honest', () => {
    expect(normalizeOptionalStudentNumber(undefined)).toBeNull()
    expect(normalizeOptionalStudentNumber(' 20260001 ')).toBe('20260001')
    expect(() => normalizeOptionalStudentNumber('2026A001')).toThrow(
      'student number',
    )
    expect(normalizeOptionalMajor('  天文 学\u0301  ')).toBe(
      '天文 学\u0301'.normalize('NFKC'),
    )
    expect(normalizeOptionalMajor('  ')).toBeNull()
  })

  it('requires structured contacts and exactly one primary contact', () => {
    expect(
      normalizeContacts([
        { isPrimary: true, type: 'wechat', value: '  fictional_wechat  ' },
        {
          isPrimary: false,
          label: '  监护人联络  ',
          type: 'other',
          value: '  fictional-contact  ',
        },
      ]),
    ).toEqual([
      { isPrimary: true, type: 'wechat', value: 'fictional_wechat' },
      {
        isPrimary: false,
        label: '监护人联络',
        type: 'other',
        value: 'fictional-contact',
      },
    ])

    expect(() =>
      normalizeContacts([{ isPrimary: false, type: 'qq', value: '10000001' }]),
    ).toThrow('primary')
    expect(() =>
      normalizeContacts([
        { isPrimary: true, type: 'other', value: 'fictional' },
      ]),
    ).toThrow('label')
    expect(() =>
      normalizeContacts([
        { isPrimary: true, type: 'phone', value: 'fictional\u0000phone' },
      ]),
    ).toThrow('control')
  })
})

describe('member account claim review states', () => {
  it('permits exactly one pending-to-terminal transition', () => {
    expect(() =>
      assertReviewTransition('pendingReview', 'approved'),
    ).not.toThrow()
    expect(() =>
      assertReviewTransition('pendingReview', 'rejected'),
    ).not.toThrow()
    expect(() => assertReviewTransition('approved', 'pendingReview')).toThrow(
      'not allowed',
    )
    expect(() => assertReviewTransition('rejected', 'approved')).toThrow(
      'not allowed',
    )
    try {
      assertReviewTransition('approved', 'rejected')
    } catch (error) {
      expect(error).toMatchObject({ code: 'CONFLICT', status: 409 })
    }
  })
})
