import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountRole } from '@/modules/authorization/authorize'
import { generateTemporaryCredential } from '@/modules/identity-access/credentials'
import {
  approveClaimAccount,
  convertClaimToPendingActivation,
  createPendingClaimAccount,
  disableClaimAccount,
  rejectClaimAccount,
  reopenClaimAccount,
  submitClaimPassword,
  type ClaimAccountStatus,
} from '@/modules/identity-access/use-cases/account-claim'
vi.mock('@/modules/identity-access/credentials', () => ({
  generateTemporaryCredential: vi.fn(),
}))

const generatedCredential = vi.mocked(generateTemporaryCredential)
const now = new Date('2026-08-10T06:00:00.000Z')
const allStatuses: readonly ClaimAccountStatus[] = [
  'active',
  'claimBlocked',
  'disabled',
  'pendingActivation',
  'pendingApproval',
  'pendingClaim',
]

type AccountDocument = {
  accessExpiresAt: null | string
  defaultRoleExpiresAt: null | string
  id: string
  recordVersion: number
  role: AccountRole
  status: ClaimAccountStatus
  [key: string]: unknown
}

function account(
  status: ClaimAccountStatus,
  overrides: Partial<AccountDocument> = {},
): AccountDocument {
  return {
    accessExpiresAt: null,
    defaultRoleExpiresAt: null,
    id: '10000000-0000-4000-8000-000000000101',
    recordVersion: 7,
    role: 'member',
    status,
    ...overrides,
  }
}

function harness(initial: AccountDocument) {
  let stored = { ...initial }
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    stored = { ...stored, ...data }
    return { ...stored }
  })
  const findByID = vi.fn(async () => ({ ...stored }))
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    stored = { ...stored, ...data }
    return { ...stored }
  })
  const updateOne = vi.fn(async () => undefined)
  return {
    payload: { create, db: { updateOne }, findByID, update } as never,
    req: { context: {} } as never,
    stored: () => stored,
    spies: { create, findByID, update, updateOne },
  }
}

function expectNoCredential(result: unknown): void {
  expect(result).not.toHaveProperty('temporaryCredential')
  expect(result).not.toHaveProperty('temporaryCredentialExpiresAt')
  expect(result).not.toHaveProperty('hash')
  expect(result).not.toHaveProperty('salt')
}

function expectPasswordFieldOnly(data: Record<string, unknown>): void {
  expect(data.password).toBeTypeOf('string')
  expect(data).not.toHaveProperty('hash')
  expect(data).not.toHaveProperty('salt')
}

async function expectConflict(operation: () => Promise<unknown>) {
  await expect(operation()).rejects.toMatchObject({
    code: 'CONFLICT',
    status: 409,
  })
}

beforeEach(() => {
  generatedCredential.mockReset()
  generatedCredential.mockReturnValue('INTERNAL-CREDENTIAL-NOT-RETURNED')
})

describe('identity-access claim account creation and submission', () => {
  it('creates pendingClaim through the Payload password field without returning the internal credential', async () => {
    const test = harness(account('pendingClaim', { recordVersion: 1 }))
    const result = await createPendingClaimAccount(test.payload, test.req, {
      displayName: '  虚构会员  ',
      loginName: ' 20260001 ',
      role: 'member',
      studentNumber: '20260001',
    })

    const data = test.spies.create.mock.calls[0]?.[0].data
    expect(data).toMatchObject({
      accessExpiresAt: null,
      defaultRoleExpiresAt: null,
      displayName: '虚构会员',
      password: 'INTERNAL-CREDENTIAL-NOT-RETURNED',
      role: 'member',
      status: 'pendingClaim',
      studentNumber: '20260001',
      temporaryCredentialExpiresAt: null,
      username: '20260001',
    })
    expectPasswordFieldOnly(data)
    expectNoCredential(result)
  })

  it('submits a formal password only from pendingClaim and clears existing sessions', async () => {
    const test = harness(account('pendingClaim'))
    const password = 'Fictional-Claim-Password-2026!'
    const result = await submitClaimPassword(test.payload, test.req, {
      authUserId: test.stored().id,
      expectedVersion: 7,
      password,
    })

    const data = test.spies.update.mock.calls[0]?.[0].data
    expect(data).toMatchObject({
      password,
      recordVersion: 8,
      status: 'pendingApproval',
      temporaryCredentialExpiresAt: null,
    })
    expectPasswordFieldOnly(data)
    expect(test.spies.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sessions: [] }, id: test.stored().id }),
    )
    expectNoCredential(result)
  })

  it.each(allStatuses.filter((status) => status !== 'pendingClaim'))(
    'rejects submit from %s without changing password or sessions',
    async (status) => {
      const test = harness(account(status))
      await expectConflict(() =>
        submitClaimPassword(test.payload, test.req, {
          authUserId: test.stored().id,
          expectedVersion: 7,
          password: 'Fictional-Claim-Password-2026!',
        }),
      )
      expect(test.spies.update).not.toHaveBeenCalled()
      expect(test.spies.updateOne).not.toHaveBeenCalled()
    },
  )

  it('rejects a stale expectedVersion before writing the password', async () => {
    const test = harness(account('pendingClaim'))
    await expectConflict(() =>
      submitClaimPassword(test.payload, test.req, {
        authUserId: test.stored().id,
        expectedVersion: 6,
        password: 'Fictional-Claim-Password-2026!',
      }),
    )
    expect(test.spies.update).not.toHaveBeenCalled()
    expect(test.spies.updateOne).not.toHaveBeenCalled()
  })
})

describe('identity-access claim approval', () => {
  it.each([
    ['staff', '2027-06-10T06:00:00.000Z'],
    ['member', null],
    ['cadre', null],
  ] as const)(
    'activates a %s account with the correct role expiry',
    async (role, expiry) => {
      const test = harness(account('pendingApproval', { role }))
      const result = await approveClaimAccount(test.payload, test.req, {
        authUserId: test.stored().id,
        expectedVersion: 7,
        now,
      })

      expect(test.spies.update.mock.calls[0]?.[0].data).toMatchObject({
        accessExpiresAt: expiry,
        defaultRoleExpiresAt: expiry,
        recordVersion: 8,
        status: 'active',
      })
      expect(result).toMatchObject({
        defaultRoleExpiresAt: expiry,
        status: 'active',
      })
    },
  )

  it.each(allStatuses.filter((status) => status !== 'pendingApproval'))(
    'rejects approval from %s',
    async (status) => {
      const test = harness(account(status))
      await expectConflict(() =>
        approveClaimAccount(test.payload, test.req, {
          authUserId: test.stored().id,
          expectedVersion: 7,
          now,
        }),
      )
      expect(test.spies.update).not.toHaveBeenCalled()
    },
  )
})

describe('identity-access claim optimistic concurrency', () => {
  it.each([
    [
      'approve',
      'pendingApproval',
      (test: ReturnType<typeof harness>) =>
        approveClaimAccount(test.payload, test.req, {
          authUserId: test.stored().id,
          expectedVersion: 6,
          now,
        }),
    ],
    [
      'reject',
      'pendingApproval',
      (test: ReturnType<typeof harness>) =>
        rejectClaimAccount(test.payload, test.req, {
          authUserId: test.stored().id,
          expectedVersion: 6,
        }),
    ],
    [
      'reopen',
      'claimBlocked',
      (test: ReturnType<typeof harness>) =>
        reopenClaimAccount(test.payload, test.req, {
          authUserId: test.stored().id,
          expectedVersion: 6,
        }),
    ],
    [
      'disable',
      'pendingClaim',
      (test: ReturnType<typeof harness>) =>
        disableClaimAccount(test.payload, test.req, {
          authUserId: test.stored().id,
          expectedVersion: 6,
        }),
    ],
    [
      'convert',
      'pendingClaim',
      (test: ReturnType<typeof harness>) =>
        convertClaimToPendingActivation(test.payload, test.req, {
          authUserId: test.stored().id,
          expectedVersion: 6,
          now,
        }),
    ],
  ] as const)(
    'rejects stale expectedVersion before %s side effects',
    async (_label, status, operation) => {
      const test = harness(account(status))
      await expectConflict(() => operation(test))
      expect(test.spies.update).not.toHaveBeenCalled()
      expect(test.spies.updateOne).not.toHaveBeenCalled()
      expect(generatedCredential).not.toHaveBeenCalled()
    },
  )
})

describe('identity-access credential invalidation transitions', () => {
  it.each([
    ['reject', 'pendingApproval', 'claimBlocked', rejectClaimAccount],
    ['reopen', 'claimBlocked', 'pendingClaim', reopenClaimAccount],
    ['disable pending claim', 'pendingClaim', 'disabled', disableClaimAccount],
    [
      'disable pending approval',
      'pendingApproval',
      'disabled',
      disableClaimAccount,
    ],
    ['disable blocked claim', 'claimBlocked', 'disabled', disableClaimAccount],
  ] as const)(
    '%s replaces the credential, clears sessions and returns no secret',
    async (_label, from, to, operation) => {
      const test = harness(account(from))
      const result = await operation(test.payload, test.req, {
        authUserId: test.stored().id,
        expectedVersion: 7,
      })

      const data = test.spies.update.mock.calls[0]?.[0].data
      expect(data).toMatchObject({
        password: 'INTERNAL-CREDENTIAL-NOT-RETURNED',
        recordVersion: 8,
        status: to,
        temporaryCredentialExpiresAt: null,
      })
      expectPasswordFieldOnly(data)
      expect(test.spies.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { sessions: [] },
          id: test.stored().id,
        }),
      )
      expectNoCredential(result)
    },
  )

  it.each([
    ['reject', rejectClaimAccount, ['pendingApproval']],
    ['reopen', reopenClaimAccount, ['claimBlocked']],
    [
      'disable',
      disableClaimAccount,
      ['pendingClaim', 'pendingApproval', 'claimBlocked'],
    ],
  ] as const)(
    'rejects every illegal %s source state',
    async (_label, operation, allowed) => {
      for (const status of allStatuses.filter(
        (candidate) => !allowed.includes(candidate as never),
      )) {
        const test = harness(account(status))
        await expectConflict(() =>
          operation(test.payload, test.req, {
            authUserId: test.stored().id,
            expectedVersion: 7,
          }),
        )
        expect(test.spies.update).not.toHaveBeenCalled()
        expect(test.spies.updateOne).not.toHaveBeenCalled()
      }
    },
  )
})

describe('identity-access conversion to direct activation', () => {
  it.each(['pendingClaim', 'pendingApproval', 'claimBlocked'] as const)(
    'converts %s with one returned credential and a fresh staff expiry',
    async (status) => {
      const test = harness(account(status, { role: 'staff' }))
      generatedCredential.mockReturnValueOnce('DIRECT-ONCE-CREDENTIAL')
      const command = {
        authUserId: test.stored().id,
        expectedVersion: 7,
        now,
      }
      const result = await convertClaimToPendingActivation(
        test.payload,
        test.req,
        command,
      )

      const data = test.spies.update.mock.calls[0]?.[0].data
      expect(data).toMatchObject({
        accessExpiresAt: '2027-06-10T06:00:00.000Z',
        defaultRoleExpiresAt: '2027-06-10T06:00:00.000Z',
        password: 'DIRECT-ONCE-CREDENTIAL',
        recordVersion: 8,
        status: 'pendingActivation',
        temporaryCredentialExpiresAt: '2026-08-13T06:00:00.000Z',
      })
      expectPasswordFieldOnly(data)
      expect(result).toMatchObject({
        temporaryCredential: 'DIRECT-ONCE-CREDENTIAL',
        temporaryCredentialExpiresAt: '2026-08-13T06:00:00.000Z',
      })
      expect(generatedCredential).toHaveBeenCalledTimes(1)
      expect(test.spies.updateOne).toHaveBeenCalledTimes(1)

      await expectConflict(() =>
        convertClaimToPendingActivation(test.payload, test.req, command),
      )
      expect(generatedCredential).toHaveBeenCalledTimes(1)
      expect(test.spies.update).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['active', 'disabled', 'pendingActivation'] as const)(
    'rejects conversion from %s without generating a credential',
    async (status) => {
      const test = harness(account(status))
      await expectConflict(() =>
        convertClaimToPendingActivation(test.payload, test.req, {
          authUserId: test.stored().id,
          expectedVersion: 7,
          now,
        }),
      )
      expect(generatedCredential).not.toHaveBeenCalled()
      expect(test.spies.update).not.toHaveBeenCalled()
      expect(test.spies.updateOne).not.toHaveBeenCalled()
    },
  )
})
