import { describe, expect, it } from 'vitest'

import type { Actor } from '@/modules/authorization/authorize'
import {
  addCalendarMonths,
  assertCanManage,
  normalizeDisplayName,
  normalizeLoginName,
  roleExpiryForTransition,
} from '@/modules/identity-access/domain'
import {
  activationSchema,
  selfPasswordSchema,
} from '@/modules/identity-access/schemas'
import { BusinessError } from '@/modules/shared/business-error'

function actor(role: Actor['role'], id = `${role}-actor`): Actor {
  return {
    id,
    overrides: [],
    role,
    status: 'active',
  }
}

function expectBusinessError(
  operation: () => unknown,
  code: BusinessError['code'],
  status: number,
): void {
  try {
    operation()
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessError)
    expect(error).toMatchObject({ code, status })
    return
  }
  throw new Error(`Expected ${code}`)
}

describe('identity-access account normalization', () => {
  it('normalizes external login names and rejects student identifiers', () => {
    expect(normalizeLoginName('external', '  Guest.Editor-01  ')).toEqual({
      loginName: 'guest.editor-01',
      studentNumber: null,
    })

    for (const loginName of ['ab', '1guest', 'guest name', 'guest@example']) {
      expectBusinessError(
        () => normalizeLoginName('external', loginName),
        'VALIDATION_FAILED',
        400,
      )
    }
    expectBusinessError(
      () => normalizeLoginName('external', 'guest', '20260001'),
      'VALIDATION_FAILED',
      400,
    )
  })

  it('requires student login names to equal a 6–32 digit student number', () => {
    expect(normalizeLoginName('student', ' 20260001 ', ' 20260001 ')).toEqual({
      loginName: '20260001',
      studentNumber: '20260001',
    })
    expect(normalizeLoginName('student', '20260002')).toEqual({
      loginName: '20260002',
      studentNumber: '20260002',
    })

    for (const [loginName, studentNumber] of [
      ['20260', '20260'],
      ['20260001', '20260002'],
      ['２０２６０００１', '２０２６０００１'],
      ['2026A001', '2026A001'],
    ] as const) {
      expectBusinessError(
        () => normalizeLoginName('student', loginName, studentNumber),
        'VALIDATION_FAILED',
        400,
      )
    }
  })

  it('trims display names and enforces the 1–100 character boundary', () => {
    expect(normalizeDisplayName('  虚构用户  ')).toBe('虚构用户')
    expect(normalizeDisplayName('名'.repeat(100))).toHaveLength(100)
    expectBusinessError(
      () => normalizeDisplayName('   '),
      'VALIDATION_FAILED',
      400,
    )
    expectBusinessError(
      () => normalizeDisplayName('名'.repeat(101)),
      'VALIDATION_FAILED',
      400,
    )
  })
})

describe('identity-access role transitions', () => {
  it('adds ten calendar months while clamping month-end dates', () => {
    expect(addCalendarMonths(new Date('2024-04-30T08:30:00.000Z'), 10)).toEqual(
      new Date('2025-02-28T08:30:00.000Z'),
    )
    expect(addCalendarMonths(new Date('2023-04-30T08:30:00.000Z'), 10)).toEqual(
      new Date('2024-02-29T08:30:00.000Z'),
    )
  })

  it('sets a fresh ten-month expiry only when entering staff', () => {
    const now = new Date('2024-04-30T08:30:00.000Z')
    expect(roleExpiryForTransition('cadre', 'staff', now)).toBe(
      '2025-02-28T08:30:00.000Z',
    )
    expect(roleExpiryForTransition('staff', 'staff', now)).toBeUndefined()
    expect(roleExpiryForTransition('staff', 'cadre', now)).toBeNull()
  })

  it('enforces each manager role ceiling against current and next roles', () => {
    expect(() =>
      assertCanManage(actor('cadre'), 'member-1', 'member', 'staff'),
    ).not.toThrow()
    expect(() =>
      assertCanManage(actor('cadre'), 'staff-1', 'staff', 'staff'),
    ).not.toThrow()
    expect(() =>
      assertCanManage(actor('admin'), 'staff-1', 'staff', 'cadre'),
    ).not.toThrow()
    expect(() =>
      assertCanManage(actor('owner'), 'admin-1', 'admin', 'staff'),
    ).not.toThrow()

    for (const operation of [
      () => assertCanManage(actor('staff'), 'staff-1', 'staff', 'staff'),
      () => assertCanManage(actor('member'), 'member-1', 'member', 'member'),
      () => assertCanManage(actor('cadre'), 'staff-1', 'staff', 'cadre'),
      () => assertCanManage(actor('admin'), 'admin-1', 'admin', 'staff'),
      () => assertCanManage(actor('owner'), 'owner-1', 'owner', 'admin'),
    ]) {
      expectBusinessError(operation, 'FORBIDDEN', 403)
    }
  })

  it('rejects self-management before considering an otherwise valid role change', () => {
    const admin = actor('admin', 'admin-self')
    expectBusinessError(
      () => assertCanManage(admin, admin.id, 'staff', 'staff'),
      'FORBIDDEN',
      403,
    )
  })
})

describe('identity-access password length', () => {
  const activationInput = (password: string) => ({
    loginName: 'fictional-user',
    newPassword: password,
    newPasswordConfirmation: password,
    temporaryCredential: 'fictional-temporary-credential',
  })
  const selfInput = (password: string) => ({
    currentPassword: 'fictional-current-password',
    expectedVersion: 1,
    newPassword: password,
    newPasswordConfirmation: password,
  })

  it.each([
    ['ASCII 11', 'x'.repeat(11), false],
    ['ASCII 12', 'x'.repeat(12), true],
    ['ASCII 128', 'x'.repeat(128), true],
    ['ASCII 129', 'x'.repeat(129), false],
    ['astral 11', '😀'.repeat(11), false],
    ['astral 12', '😀'.repeat(12), true],
    ['astral 128', '😀'.repeat(128), true],
    ['astral 129', '😀'.repeat(129), false],
  ])('counts %s by Unicode code point', (_label, password, accepted) => {
    expect(activationSchema.safeParse(activationInput(password)).success).toBe(
      accepted,
    )
    expect(selfPasswordSchema.safeParse(selfInput(password)).success).toBe(
      accepted,
    )
  })
})
