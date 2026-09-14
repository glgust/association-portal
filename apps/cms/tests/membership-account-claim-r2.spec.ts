import { describe, expect, it, vi } from 'vitest'

import { idempotencyKeyFrom } from '@/app/api/v1/membership/_shared'
import { withMemberClaimLocks } from '@/modules/recruitment/member-account-claim/transaction'
import { isKnownMemberCreationConflict } from '@/modules/recruitment/member-account-claim/use-cases/member-creation-conflict'

describe('membership R2 transport and concurrency boundaries', () => {
  it('accepts a UUID idempotency key and rejects PII, secrets, and free text at the CMS boundary', () => {
    const uuid = '9f0b30b8-14c1-4b25-8b6c-d59447fd61d2'
    expect(idempotencyKeyFrom(new Headers({ 'idempotency-key': uuid }))).toBe(
      uuid,
    )
    for (const invalid of [
      '13800138000',
      '202612345678',
      'member@example.com',
      'password123',
      'free-form-idempotency-key',
      'a'.repeat(101),
    ]) {
      expect(() =>
        idempotencyKeyFrom(new Headers({ 'idempotency-key': invalid })),
      ).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_FAILED', status: 400 }),
      )
    }
  })

  it('uses one non-PII advisory resource for the same normalized student number', async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      void sql
      void params
    })
    const release = vi.fn()
    const payload = {
      db: {
        pool: { connect: vi.fn(async () => ({ query, release })) },
      },
    }
    await withMemberClaimLocks(
      payload as never,
      { memberStudentNumbers: ['202612345678', '202612345678'] },
      async () => undefined,
    )
    const resources = query.mock.calls.map((call) => String(call[1][0]))
    expect(resources).toHaveLength(2)
    expect(resources[0]).toBe(resources[1])
    expect(resources[0]).not.toContain('202612345678')
    expect(release).toHaveBeenCalledOnce()
  })

  it('maps only known Member/AuthUser unique constraints', () => {
    expect(
      isKnownMemberCreationConflict(
        { code: '23505', constraint: 'members_student_number_idx' },
        { includeAccount: false },
      ),
    ).toBe(true)
    expect(
      isKnownMemberCreationConflict(
        { code: '23505', constraint: 'auth_users_username_idx' },
        { includeAccount: true },
      ),
    ).toBe(true)
    expect(
      isKnownMemberCreationConflict(
        { code: '23505', constraint: 'unrelated_unique_idx' },
        { includeAccount: true },
      ),
    ).toBe(false)
    expect(
      isKnownMemberCreationConflict(new Error('database unavailable'), {
        includeAccount: true,
      }),
    ).toBe(false)
  })
})
