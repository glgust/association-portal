import { describe, expect, it, vi } from 'vitest'

import {
  accountLockResource,
  withAccountLock,
} from '@/modules/identity-access/transaction'
import { withMemberClaimLocks } from '@/modules/recruitment/member-account-claim/transaction'

function lockHarness() {
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    void sql
    void params
  })
  const release = vi.fn()
  return {
    payload: {
      db: { pool: { connect: vi.fn(async () => ({ query, release })) } },
    },
    query,
    release,
  }
}

describe('shared identity and membership advisory locks', () => {
  it('uses one canonical account resource in both modules', async () => {
    const identity = lockHarness()
    await withAccountLock(
      identity.payload as never,
      'account-1',
      async () => undefined,
    )
    expect(identity.query.mock.calls.map((call) => call[1]?.[0])).toEqual([
      accountLockResource('account-1'),
      accountLockResource('account-1'),
    ])

    const membership = lockHarness()
    await withMemberClaimLocks(
      membership.payload as never,
      { accountIds: ['account-1'] },
      async () => undefined,
    )
    expect(membership.query.mock.calls.map((call) => call[1]?.[0])).toEqual([
      accountLockResource('account-1'),
      accountLockResource('account-1'),
    ])
  })

  it('deduplicates and sorts typed resources before locking, then unlocks in reverse', async () => {
    const test = lockHarness()
    await withMemberClaimLocks(
      test.payload as never,
      {
        accountIds: ['account-b', 'account-a', 'account-a'],
        claimIds: ['claim-a'],
        memberIds: ['member-a'],
      },
      async () => undefined,
    )
    const keys = test.query.mock.calls.map((call) => call[1]?.[0] as string)
    const locked = keys.slice(0, keys.length / 2)
    const unlocked = keys.slice(keys.length / 2)
    expect(locked).toEqual([...new Set(locked)].sort())
    expect(unlocked).toEqual([...locked].reverse())
    expect(test.release).toHaveBeenCalledOnce()
  })
})
