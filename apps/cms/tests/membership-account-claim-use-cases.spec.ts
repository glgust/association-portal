import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadActor } from '@/modules/authorization/load-actor'
import { convertMemberClaimToDirect } from '@/modules/recruitment/member-account-claim/use-cases/convert-to-direct'
import { disableMemberClaimAccount } from '@/modules/recruitment/member-account-claim/use-cases/disable-claim'
import { preconfigureMemberAccountClaim } from '@/modules/recruitment/member-account-claim/use-cases/preconfigure'
import { reopenMemberAccountClaim } from '@/modules/recruitment/member-account-claim/use-cases/reopen'
import {
  approveAccountClaim,
  rejectAccountClaim,
} from '@/modules/recruitment/member-account-claim/use-cases/review-claim'
import {
  approveMemberIntake,
  rejectMemberIntake,
} from '@/modules/recruitment/member-account-claim/use-cases/review-intake'
import { submitAccountClaim } from '@/modules/recruitment/member-account-claim/use-cases/submit-claim'
import { submitMemberIntake } from '@/modules/recruitment/member-account-claim/use-cases/submit-intake'
import {
  reissueMembershipStatusReceipt,
  updateMembershipPublicMessage,
} from '@/modules/recruitment/member-account-claim/use-cases/status-admin'
import { withMemberClaimLocks } from '@/modules/recruitment/member-account-claim/transaction'

vi.mock('@/modules/authorization/load-actor', () => ({
  loadActor: vi.fn(),
}))

vi.mock('@/modules/recruitment/member-account-claim/transaction', () => ({
  inMemberAccountClaimTransaction: vi.fn(
    async (_req: unknown, operation: () => Promise<unknown>) => operation(),
  ),
  withMemberClaimLocks: vi.fn(
    async (
      _payload: unknown,
      _resources: readonly string[],
      operation: () => Promise<unknown>,
    ) => operation(),
  ),
}))

const now = new Date('2026-08-10T08:00:00.000Z')
const actor = {
  id: 'actor-admin',
  overrides: [],
  role: 'admin' as const,
  status: 'active' as const,
}
const contacts = [
  {
    isPrimary: true,
    label: null,
    type: 'wechat' as const,
    value: 'fictional-contact',
  },
]
const claimCommand = {
  contacts,
  major: '虚构专业',
  membershipIdentity: 'member' as const,
  name: '虚构会员',
  password: 'Fictional-password-2026!',
  passwordConfirmation: 'Fictional-password-2026!',
  studentNumber: '20260001',
}

function audit() {
  return { append: vi.fn(async () => undefined) }
}

function identity(overrides: Record<string, unknown> = {}) {
  return {
    approveClaim: vi.fn(async () => ({ recordVersion: 9 })),
    convertClaimToDirect: vi.fn(async () => ({
      recordVersion: 9,
      temporaryCredential: 'ONE-TIME-FICTIONAL-CREDENTIAL',
      temporaryCredentialExpiresAt: '2026-08-13T08:00:00.000Z',
    })),
    createPendingClaimAccount: vi.fn(async () => ({
      accountId: 'account-1',
      recordVersion: 1,
    })),
    disableClaim: vi.fn(async () => ({ recordVersion: 9 })),
    getClaimAccount: vi.fn(async () => ({
      authorizationSummary: { role: 'member', overrides: [] },
      recordVersion: 7,
      role: 'member',
      status: 'pendingClaim',
    })),
    rejectClaim: vi.fn(async () => ({ recordVersion: 9 })),
    reopenClaim: vi.fn(async () => ({ recordVersion: 9 })),
    setPermissionOverride: vi.fn(async (_req, input) => ({
      accountVersion: input.expectedVersion + 1,
      overrideId: `override-${input.expectedVersion}`,
    })),
    submitClaimPassword: vi.fn(async () => ({ recordVersion: 8 })),
    ...overrides,
  }
}

function req() {
  return { context: {} } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadActor).mockResolvedValue(actor)
})

describe('public membership submissions', () => {
  it('matches a pending account, excludes passwords from persisted fingerprint material, and replays without rewriting the password', async () => {
    let replay: Record<string, unknown> | undefined
    const create = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => {
        replay = { id: 'claim-1', ...data }
        return replay
      },
    )
    const find = vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'account-claims') {
        return { docs: replay ? [replay] : [], totalDocs: replay ? 1 : 0 }
      }
      return {
        docs: [{ authUser: 'account-1', id: 'member-1' }],
        totalDocs: 1,
      }
    })
    const payload = {
      create,
      find,
      findByID: vi.fn(async () => ({
        authUser: 'account-1',
        id: 'member-1',
      })),
    } as never
    const identityPort = identity()
    const first = await submitAccountClaim(payload, req(), {
      audit: audit(),
      command: claimCommand,
      fingerprintKey: 'server-key',
      idempotencyKey: 'idem-claim',
      identity: identityPort as never,
      now,
      requestId: 'request-first',
    })
    const second = await submitAccountClaim(payload, req(), {
      audit: audit(),
      command: {
        ...claimCommand,
        password: 'Different-fictional-password-2026!',
        passwordConfirmation: 'Different-fictional-password-2026!',
      },
      fingerprintKey: 'server-key',
      idempotencyKey: 'idem-claim',
      identity: identityPort as never,
      now,
      requestId: 'request-retry',
    })

    expect(first).toMatchObject({
      claimId: 'claim-1',
      outcome: 'pendingReview',
    })
    expect(second).toEqual(first)
    expect(identityPort.submitClaimPassword).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    const persisted = create.mock.calls[0]?.[0].data
    expect(persisted).not.toHaveProperty('password')
    expect(persisted).not.toHaveProperty('passwordConfirmation')
    expect(persisted.requestFingerprint).toBeTypeOf('string')
    expect(persisted.requestFingerprint).not.toContain('20260001')
    expect(persisted.requestFingerprint).not.toContain('fictional-contact')
  })

  it.each([
    ['no student number', { ...claimCommand, studentNumber: '' }],
    ['no unique member', claimCommand],
  ])(
    'returns the same manual outcome for %s without touching credentials',
    async (scenario, command) => {
      const identityPort = identity()
      const find = vi.fn(async ({ collection }: { collection: string }) => ({
        docs: [],
        totalDocs:
          collection === 'members' && scenario === 'no unique member' ? 0 : 0,
      }))
      const result = await submitAccountClaim({ find } as never, req(), {
        audit: audit(),
        command,
        fingerprintKey: 'server-key',
        idempotencyKey: `idem-${scenario}`,
        identity: identityPort as never,
        now,
        requestId: 'request-manual',
      })
      expect(result).toEqual({
        outcome: 'manualVerificationRequired',
        requestId: 'request-manual',
      })
      expect(identityPort.submitClaimPassword).not.toHaveBeenCalled()
    },
  )

  it('creates only an intake record and never invokes an identity credential port', async () => {
    const create = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'intake-1',
        ...data,
      }),
    )
    const result = await submitMemberIntake(
      {
        create,
        find: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
      } as never,
      req(),
      {
        audit: audit(),
        command: {
          contacts,
          major: null,
          membershipIdentity: 'member',
          name: '虚构会员',
          privacyPurposeConfirmed: true,
          studentNumber: null,
        },
        fingerprintKey: 'server-key',
        idempotencyKey: 'idem-intake',
        now,
        requestId: 'request-intake',
      },
    )
    expect(result).toMatchObject({
      intakeId: 'intake-1',
      status: 'pendingReview',
    })
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'member-intake-applications',
      data: expect.not.objectContaining({
        authUser: expect.anything(),
        password: expect.anything(),
      }),
    })
  })

  it('replays the original pending Intake result after the stored record becomes terminal', async () => {
    const replay = {
      id: 'intake-terminal',
      requestFingerprint: '',
      requestId: 'request-original',
      status: 'approved',
      statusAccessIssuedAt: now.toISOString(),
      statusAccessVersion: 1,
      submittedAt: now.toISOString(),
    }
    const command = {
      contacts,
      major: null,
      membershipIdentity: 'member' as const,
      name: '虚构终态重放会员',
      privacyPurposeConfirmed: true as const,
      studentNumber: null,
    }
    const { keyedRequestFingerprint } = await import(
      '@/modules/recruitment/member-account-claim/fingerprint'
    )
    replay.requestFingerprint = keyedRequestFingerprint(
      'server-key',
      'intake',
      {
        contacts: [
          { isPrimary: true, type: 'wechat', value: 'fictional-contact' },
        ],
        major: null,
        membershipIdentity: 'member',
        name: '虚构终态重放会员',
        privacyPurposeConfirmed: true,
        studentNumber: null,
      },
    )
    const result = await submitMemberIntake(
      {
        find: vi.fn(async () => ({ docs: [replay], totalDocs: 1 })),
      } as never,
      req(),
      {
        audit: audit(),
        command,
        fingerprintKey: 'server-key',
        idempotencyKey: 'idem-terminal',
        now,
        requestId: 'request-retry',
      },
    )
    expect(result).toMatchObject({
      intakeId: 'intake-terminal',
      requestId: 'request-original',
      status: 'pendingReview',
      statusReceipt: expect.stringMatching(/^v1\./),
      submittedAt: now.toISOString(),
    })
  })
})

describe('preconfiguration orchestration', () => {
  it.each(['admin', 'owner'] as const)(
    'lets %s create a confirmed Member and applies overrides serially by account version',
    async (role) => {
      vi.mocked(loadActor).mockResolvedValue({ ...actor, role })
      const payload = {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'member-1',
          ...data,
        })),
        find: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'member-1',
          ...data,
        })),
      }
      const identityPort = identity()
      const result = await preconfigureMemberAccountClaim(
        payload as never,
        req(),
        {
          actorId: 'actor-admin',
          audit: audit(),
          command: {
            member: {
              mode: 'create',
              offlineInterviewConfirmed: true,
              profile: {
                contacts,
                major: '虚构专业',
                membershipIdentity: 'member',
                name: '虚构会员',
                source: 'offlineInterview',
                studentNumber: '20260001',
              },
            },
            overrides: [
              {
                effect: 'deny',
                permission: 'content.edit',
                reason: 'fictional',
                scopeType: 'global',
              },
              {
                effect: 'allow',
                permission: 'content.create',
                reason: 'fictional',
                scopeType: 'global',
              },
            ],
            role: 'member',
          },
          identity: identityPort as never,
          now,
          requestId: 'request-preconfigure',
        },
      )
      expect(payload.create.mock.calls[0]?.[0].data).toMatchObject({
        recordVersion: 1,
      })
      expect(
        identityPort.setPermissionOverride.mock.calls.map(
          (call) => call[1].expectedVersion,
        ),
      ).toEqual([1, 2])
      expect(payload.update.mock.calls[0]?.[0].data).toMatchObject({
        authUser: 'account-1',
        recordVersion: 2,
      })
      expect(result).toMatchObject({
        accountVersion: 3,
        status: 'pendingClaim',
      })
    },
  )

  it('rejects an incomplete existing Member before creating an account', async () => {
    const identityPort = identity()
    const payload = {
      findByID: vi.fn(async () => ({
        confirmedAt: now.toISOString(),
        contacts: [
          { isPrimary: false, type: 'wechat', value: 'fictional-contact' },
        ],
        id: 'member-incomplete',
        membershipIdentity: 'member',
        name: '虚构会员',
        recordVersion: 1,
        source: 'offlineInterview',
        studentNumber: '20260001',
      })),
    }
    await expect(
      preconfigureMemberAccountClaim(payload as never, req(), {
        actorId: 'actor-admin',
        audit: audit(),
        command: {
          member: {
            memberId: '00000000-0000-4000-8000-000000000001',
            mode: 'existing',
          },
          overrides: [],
          role: 'member',
        },
        identity: identityPort as never,
        now,
        requestId: 'request-incomplete',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 })
    expect(identityPort.createPendingClaimAccount).not.toHaveBeenCalled()
  })
})

describe('claim review orchestration', () => {
  function reviewPayload(summary: unknown = { role: 'member', overrides: [] }) {
    const claim = {
      authUser: 'account-1',
      authorizationSummary: summary,
      contacts,
      id: 'claim-1',
      major: '新专业',
      member: 'member-1',
      recordVersion: 4,
      status: 'pendingReview',
    }
    return {
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'members'
          ? { id: 'member-1', major: '旧专业', recordVersion: 2 }
          : claim,
      ),
      update: vi.fn(
        async ({
          collection,
          data,
        }: {
          collection: string
          data: Record<string, unknown>
        }) => ({
          id: collection === 'members' ? 'member-1' : 'claim-1',
          ...data,
        }),
      ),
      db: { pool: {} },
    }
  }

  it('requires explicit stale authorization confirmation before identity or PII writes', async () => {
    const payload = reviewPayload({ role: 'member', overrides: [] })
    const identityPort = identity({
      getClaimAccount: vi.fn(async () => ({
        authorizationSummary: { role: 'staff', overrides: [] },
        recordVersion: 7,
        role: 'staff',
        status: 'pendingApproval',
      })),
    })
    await expect(
      approveAccountClaim(payload as never, req(), 'claim-1', {
        audit: audit(),
        command: {
          confirmCurrentAuthorization: false,
          expectedAccountVersion: 7,
          expectedClaimVersion: 4,
        },
        identity: identityPort as never,
        now,
        requestId: 'request-approve',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(identityPort.approveClaim).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('approves with locked server authorization, replaces Member profile, and clears claim PII', async () => {
    const payload = reviewPayload()
    const identityPort = identity({
      getClaimAccount: vi.fn(async () => ({
        authorizationSummary: { overrides: [], role: 'member' },
        recordVersion: 7,
        role: 'member',
        status: 'pendingApproval',
      })),
    })
    await approveAccountClaim(payload as never, req(), 'claim-1', {
      audit: audit(),
      command: {
        confirmCurrentAuthorization: false,
        expectedAccountVersion: 7,
        expectedClaimVersion: 4,
      },
      identity: identityPort as never,
      now,
      requestId: 'request-approve',
    })
    expect(identityPort.approveClaim).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expectedVersion: 7 }),
    )
    expect(payload.update.mock.calls[0]?.[0]).toMatchObject({
      collection: 'members',
      data: { contacts, major: '新专业', recordVersion: 3 },
    })
    expect(payload.update.mock.calls[1]?.[0]).toMatchObject({
      collection: 'account-claims',
      data: { contacts: [], major: null, recordVersion: 5, status: 'approved' },
    })
  })

  it('rejects through the password-invalidating identity port and clears duplicate PII', async () => {
    const payload = reviewPayload()
    const identityPort = identity({
      getClaimAccount: vi.fn(async () => ({
        authorizationSummary: {},
        recordVersion: 7,
        role: 'member',
        status: 'pendingApproval',
      })),
    })
    await rejectAccountClaim(payload as never, req(), 'claim-1', {
      audit: audit(),
      command: {
        expectedAccountVersion: 7,
        expectedClaimVersion: 4,
        reason: 'identityMismatch',
      },
      identity: identityPort as never,
      now,
      requestId: 'request-reject',
    })
    expect(identityPort.rejectClaim).toHaveBeenCalledWith(expect.anything(), {
      accountId: 'account-1',
      expectedVersion: 7,
      reason: 'identityMismatch',
    })
    expect(payload.update.mock.calls[0]?.[0].data).toMatchObject({
      contacts: [],
      major: null,
      status: 'rejected',
    })
  })
})

describe('intake review orchestration', () => {
  function intakePayload() {
    const intake = {
      applicantIdentity: 'member',
      contacts,
      id: 'intake-1',
      major: '申请专业',
      name: '虚构会员',
      recordVersion: 3,
      status: 'pendingReview',
      studentNumber: '20260001',
    }
    return {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'member-new',
        ...data,
      })),
      find: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'members'
          ? { id: 'member-existing', major: '原专业', recordVersion: 6 }
          : intake,
      ),
      update: vi.fn(
        async ({
          collection,
          data,
        }: {
          collection: string
          data: Record<string, unknown>
        }) => ({
          id: collection === 'members' ? 'member-existing' : 'intake-1',
          ...data,
        }),
      ),
      db: { pool: {} },
    }
  }

  it('creates a Member from reviewed profile, creates no AuthUser, and clears intake PII', async () => {
    const payload = intakePayload()
    await approveMemberIntake(payload as never, req(), 'intake-1', {
      audit: audit(),
      command: {
        adoptApplicationProfile: false,
        expectedVersion: 3,
        member: { mode: 'create' },
      },
      now,
      requestId: 'request-intake-approve',
    })
    expect(payload.create.mock.calls[0]?.[0]).toMatchObject({
      collection: 'members',
      data: { contacts, recordVersion: 1, source: 'manualVerification' },
    })
    expect(payload.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'authUser',
    )
    expect(payload.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      contacts: [],
      major: null,
      name: null,
      studentNumber: null,
    })
  })

  it.each([false, true])(
    'links an existing Member with adoptApplicationProfile=%s',
    async (adoptApplicationProfile) => {
      const payload = intakePayload()
      await approveMemberIntake(payload as never, req(), 'intake-1', {
        audit: audit(),
        command: {
          adoptApplicationProfile,
          expectedVersion: 3,
          member: { memberId: 'member-existing', mode: 'existing' },
        },
        now,
        requestId: 'request-link',
      })
      const memberWrites = payload.update.mock.calls.filter(
        (call) => call[0].collection === 'members',
      )
      expect(memberWrites).toHaveLength(adoptApplicationProfile ? 1 : 0)
      if (adoptApplicationProfile)
        expect(memberWrites[0]?.[0].data).toMatchObject({
          contacts,
          major: '申请专业',
          recordVersion: 7,
        })
      expect(payload.update.mock.calls.at(-1)?.[0].data).toMatchObject({
        member: 'member-existing',
        name: null,
        studentNumber: null,
      })
    },
  )

  it('rejects and erases all duplicated intake PII', async () => {
    const payload = intakePayload()
    await rejectMemberIntake(payload as never, req(), 'intake-1', {
      audit: audit(),
      command: { expectedVersion: 3, reason: 'applicantRequest' },
      now,
      requestId: 'request-intake-reject',
    })
    expect(payload.update.mock.calls[0]?.[0].data).toMatchObject({
      contacts: [],
      major: null,
      name: null,
      privacyPurposeConfirmed: false,
      studentNumber: null,
      status: 'rejected',
    })
  })
})

describe('claim lifecycle management orchestration', () => {
  it('reopens only through the identity port and returns no credential', async () => {
    const identityPort = identity({
      getClaimAccount: vi.fn(async () => ({
        authorizationSummary: {},
        recordVersion: 8,
        role: 'member',
        status: 'claimBlocked',
      })),
    })
    const result = await reopenMemberAccountClaim(
      {
        db: { pool: {} },
        find: vi.fn(async () => ({
          docs: [
            { id: 'claim-rejected', recordVersion: 4, status: 'rejected' },
          ],
          totalDocs: 1,
        })),
        findByID: vi.fn(async () => ({
          id: 'claim-rejected',
          recordVersion: 4,
          status: 'rejected',
        })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'claim-rejected',
          ...data,
        })),
      } as never,
      req(),
      {
        accountId: 'account-1',
        audit: audit(),
        command: {
          expectedAccountVersion: 8,
          expectedClaimVersion: 4,
          reason: 'insufficientEvidence',
        },
        identity: identityPort as never,
        now,
        requestId: 'request-reopen',
      },
    )
    expect(identityPort.reopenClaim).toHaveBeenCalledTimes(1)
    expect(result).not.toHaveProperty('temporaryCredential')
  })

  it.each(['convert', 'disable'] as const)(
    '%s closes an active claim and only convert returns a credential',
    async (action) => {
      const payload = {
        db: { pool: {} },
        find: vi.fn(async () => ({
          docs: [
            {
              authUser: 'account-1',
              id: 'claim-1',
              member: 'member-1',
              recordVersion: 4,
              status: 'pendingReview',
            },
          ],
          totalDocs: 1,
        })),
        findByID: vi.fn(async () => ({
          authUser: 'account-1',
          id: 'claim-1',
          member: 'member-1',
          recordVersion: 4,
          status: 'pendingReview',
        })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'claim-1',
          ...data,
        })),
      }
      const identityPort = identity({
        getClaimAccount: vi.fn(async () => ({
          authorizationSummary: {},
          recordVersion: 8,
          role: 'member',
          status: 'pendingApproval',
        })),
      })
      const result =
        action === 'convert'
          ? await convertMemberClaimToDirect(
              payload as never,
              req(),
              'account-1',
              {
                audit: audit(),
                command: {
                  claimId: 'claim-1',
                  confirmEffects: true,
                  expectedAccountVersion: 8,
                  expectedClaimVersion: 4,
                  reason: 'policyOrEligibility',
                },
                identity: identityPort as never,
                now,
                requestId: 'request-convert',
              },
            )
          : await disableMemberClaimAccount(
              payload as never,
              req(),
              'account-1',
              {
                audit: audit(),
                command: {
                  expectedAccountVersion: 8,
                  reason: 'fictional admin decision',
                },
                identity: identityPort as never,
                now,
                requestId: 'request-disable',
              },
            )
      expect(payload.update.mock.calls[0]?.[0].data).toMatchObject({
        contacts: [],
        major: null,
        status: 'rejected',
      })
      if (action === 'convert') {
        expect(result).toHaveProperty(
          'temporaryCredential',
          'ONE-TIME-FICTIONAL-CREDENTIAL',
        )
      } else {
        expect(result).not.toHaveProperty('temporaryCredential')
      }
    },
  )
})

describe('failure boundaries', () => {
  it('converts only the explicitly selected claim when account history has matching versions', async () => {
    const selectedClaimId = 'claim-selected'
    const historicalClaimId = 'claim-history'
    const update = vi.fn(async ({ id, data }) => ({ id, ...data }))
    const findByID = vi.fn(async ({ collection, id }) => {
      if (collection === 'members') {
        return { authUser: 'account-1', id: 'member-1' }
      }
      if (id === historicalClaimId) {
        return {
          authUser: 'account-1',
          id,
          member: 'member-1',
          recordVersion: 4,
          status: 'pendingReview',
        }
      }
      return {
        authUser: 'account-1',
        id: selectedClaimId,
        member: 'member-1',
        recordVersion: 4,
        status: 'pendingReview',
      }
    })
    const identityPort = identity({
      getClaimAccount: vi.fn(async () => ({
        authorizationSummary: {},
        recordVersion: 8,
        role: 'member',
        status: 'pendingApproval',
      })),
    })
    const result = await convertMemberClaimToDirect(
      { db: { pool: {} }, findByID, update } as never,
      req(),
      'account-1',
      {
        audit: audit(),
        command: {
          claimId: selectedClaimId,
          confirmEffects: true,
          expectedAccountVersion: 8,
          expectedClaimVersion: 4,
          reason: 'policyOrEligibility',
        },
        identity: identityPort as never,
        now,
        requestId: 'request-specific-conversion',
      },
    )
    expect(result.claimId).toBe(selectedClaimId)
    expect(findByID).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: historicalClaimId }),
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: selectedClaimId }),
    )
  })

  it('returns a stable 409 without writes when terminal receipt reissue is older than 30 days', async () => {
    const update = vi.fn()
    const append = vi.fn()
    await expect(
      reissueMembershipStatusReceipt(
        {
          findByID: vi.fn(async () => ({
            authUser: 'account-1',
            id: 'claim-expired',
            recordVersion: 4,
            reviewedAt: '2026-07-01T00:00:00.000Z',
            status: 'approved',
            statusAccessVersion: 1,
          })),
          update,
        } as never,
        req(),
        'claim',
        'claim-expired',
        {
          audit: { append },
          command: { expectedVersion: 4, reason: '虚构过期重签验证' },
          identity: identity() as never,
          now,
          receiptKey: 'fictional-receipt-key-with-sufficient-entropy',
          requestId: 'request-expired-reissue',
        },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
    expect(update).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
  })

  it('rejects pending receipt reissue with stable 409 and zero writes', async () => {
    const update = vi.fn()
    const append = vi.fn()
    await expect(
      reissueMembershipStatusReceipt(
        {
          findByID: vi.fn(async () => ({
            authUser: 'account-1',
            id: 'claim-pending',
            recordVersion: 2,
            status: 'pendingReview',
            statusAccessVersion: 1,
          })),
          update,
        } as never,
        req(),
        'claim',
        'claim-pending',
        {
          audit: { append },
          command: { expectedVersion: 2, reason: '虚构待审核重签验证' },
          identity: identity() as never,
          now,
          receiptKey: 'fictional-receipt-key-with-sufficient-entropy',
          requestId: 'request-pending-reissue',
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(update).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
  })

  it.each(['message', 'receipt'] as const)(
    'denies an admin %s operation after the Claim target becomes admin with zero writes',
    async (operation) => {
      const update = vi.fn()
      const append = vi.fn()
      const payload = {
        findByID: vi.fn(async () => ({
          authUser: 'account-1',
          id: 'claim-admin-target',
          recordVersion: 4,
          reviewedAt: '2026-08-01T00:00:00.000Z',
          status: 'approved',
          statusAccessVersion: 1,
        })),
        update,
      }
      const targetIdentity = identity({
        getClaimAccount: vi.fn(async () => ({
          authorizationSummary: {},
          recordVersion: 9,
          role: 'admin',
          status: 'active',
        })),
      })
      const common = {
        audit: { append },
        identity: targetIdentity as never,
        now,
        requestId: `request-admin-target-${operation}`,
      }
      const action =
        operation === 'message'
          ? updateMembershipPublicMessage(
              payload as never,
              req(),
              'claim',
              'claim-admin-target',
              {
                ...common,
                command: {
                  expectedVersion: 4,
                  publicMessage: '虚构留言',
                  reason: '虚构目标角色上限验证',
                },
              },
            )
          : reissueMembershipStatusReceipt(
              payload as never,
              req(),
              'claim',
              'claim-admin-target',
              {
                ...common,
                command: {
                  expectedVersion: 4,
                  reason: '虚构目标角色上限验证',
                },
                receiptKey: 'fictional-receipt-key-with-sufficient-entropy',
              },
            )
      await expect(action).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      })
      expect(update).not.toHaveBeenCalled()
      expect(append).not.toHaveBeenCalled()
      expect(withMemberClaimLocks).toHaveBeenLastCalledWith(
        payload,
        {
          accountIds: ['account-1'],
          claimIds: ['claim-admin-target'],
        },
        expect.any(Function),
      )
    },
  )

  it('stops before identity and data writes on a stale claim version', async () => {
    const payload = {
      db: { pool: {} },
      findByID: vi.fn(async () => ({
        authUser: 'account-1',
        authorizationSummary: {},
        id: 'claim-1',
        member: 'member-1',
        recordVersion: 5,
        status: 'pendingReview',
      })),
      update: vi.fn(),
    }
    const identityPort = identity()
    await expect(
      approveAccountClaim(payload as never, req(), 'claim-1', {
        audit: audit(),
        command: {
          confirmCurrentAuthorization: false,
          expectedAccountVersion: 7,
          expectedClaimVersion: 4,
        },
        identity: identityPort as never,
        now,
        requestId: 'request-stale',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(identityPort.getClaimAccount).not.toHaveBeenCalled()
    expect(identityPort.approveClaim).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('propagates audit failure from inside the orchestration transaction boundary', async () => {
    const failedAudit = {
      append: vi.fn(async () => {
        throw new Error('fictional audit outage')
      }),
    }
    const payload = {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'intake-1',
        ...data,
      })),
      find: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
    }
    await expect(
      submitMemberIntake(payload as never, req(), {
        audit: failedAudit,
        command: {
          contacts,
          major: null,
          membershipIdentity: 'member',
          name: '虚构会员',
          privacyPurposeConfirmed: true,
          studentNumber: null,
        },
        fingerprintKey: 'server-key',
        idempotencyKey: 'idem-audit-failure',
        now,
        requestId: 'request-audit-failure',
      }),
    ).rejects.toThrow('fictional audit outage')
    expect(payload.create).toHaveBeenCalledTimes(1)
    expect(failedAudit.append).toHaveBeenCalledTimes(1)
  })
})
