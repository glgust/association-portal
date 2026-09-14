import { describe, expect, it, vi } from 'vitest'

import {
  issueStatusReceipt,
  verifyStatusReceipt,
} from '@/modules/recruitment/member-account-claim/status-receipt'
import { publicMessageDefaults } from '@/modules/recruitment/member-account-claim/public-messages'
import { queryMembershipStatus } from '@/modules/recruitment/member-account-claim/use-cases/query-status'
import { canReissueMembershipStatusReceipt } from '@/modules/recruitment/member-account-claim/use-cases/status-admin'
import { BusinessError } from '@/modules/shared/business-error'

const key = 'fictional-server-secret-with-sufficient-entropy'
const claimId = '00000000-0000-4000-8000-000000000101'
const issuedAt = '2026-08-15T00:00:00.000Z'

function receipt(kind: 'claim' | 'intake' = 'claim') {
  return issueStatusReceipt(key, {
    id: claimId,
    issuedAt,
    kind,
    version: 3,
  })
}

describe('membership status receipt', () => {
  it('is versioned, signed, contains no PII, and rejects tampering', () => {
    const value = receipt()
    expect(value).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(value).not.toContain('student')
    expect(value).not.toContain('password')
    expect(verifyStatusReceipt(key, value)).toEqual({
      id: claimId,
      issuedAt,
      kind: 'claim',
      version: 3,
    })
    const [version, body, signature] = value.split('.')
    const tamperedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    expect(
      verifyStatusReceipt(key, `${version}.${body}.${tamperedSignature}`),
    ).toBeNull()
    expect(verifyStatusReceipt('rotated-secret', value)).toBeNull()
  })

  it('returns only the frozen coarse status and public message', async () => {
    const findByID = vi.fn(async () => ({
      authUser: '00000000-0000-4000-8000-000000000102',
      authorizationSummary: { role: 'owner' },
      publicMessage: '请使用正式密码登录。',
      publicMessageUpdatedAt: '2026-08-15T01:00:00.000Z',
      reviewedAt: '2026-08-15T00:30:00.000Z',
      status: 'approved',
      statusAccessIssuedAt: issuedAt,
      statusAccessVersion: 3,
      submittedAt: issuedAt,
    }))
    const result = await queryMembershipStatus(
      { findByID } as never,
      { context: {} } as never,
      {
        identity: {
          getClaimAccount: vi.fn(async () => ({
            authorizationSummary: {},
            recordVersion: 7,
            role: 'member',
            status: 'active',
          })),
        } as never,
        now: new Date('2026-08-16T00:00:00.000Z'),
        receipt: receipt(),
        receiptKey: key,
        requestId: 'request-status',
      },
    )
    expect(result).toEqual({
      nextStep: expect.stringContaining('CMS'),
      publicMessage: '请使用正式密码登录。',
      requestId: 'request-status',
      status: 'approvedCanLogin',
      updatedAt: '2026-08-15T01:00:00.000Z',
    })
    expect(result).not.toHaveProperty('authorizationSummary')
    expect(result).not.toHaveProperty('authUser')
  })

  it('reports a converted claim as login-ready after temporary activation completes', async () => {
    const result = await queryMembershipStatus(
      {
        findByID: vi.fn(async () => ({
          authUser: '00000000-0000-4000-8000-000000000102',
          convertedAt: '2026-08-15T00:30:00.000Z',
          publicMessage: publicMessageDefaults.claimConverted,
          reviewedAt: '2026-08-15T00:30:00.000Z',
          status: 'rejected',
          statusAccessIssuedAt: issuedAt,
          statusAccessVersion: 3,
          submittedAt: issuedAt,
        })),
      } as never,
      { context: {} } as never,
      {
        identity: {
          getClaimAccount: vi.fn(async () => ({
            authorizationSummary: {},
            recordVersion: 8,
            role: 'member',
            status: 'active',
          })),
        } as never,
        now: new Date('2026-08-16T00:00:00.000Z'),
        receipt: receipt(),
        receiptKey: key,
        requestId: 'request-converted-active',
      },
    )
    expect(result.status).toBe('approvedCanLogin')
    expect(result.nextStep).toContain('CMS')
    expect(result.publicMessage).not.toContain('未通过')
    expect(result.publicMessage).toContain('正式密码登录')
  })

  it('replaces stale system guidance after an approved account is disabled but preserves manager text', async () => {
    async function query(publicMessage: string) {
      return queryMembershipStatus(
        {
          findByID: vi.fn(async () => ({
            authUser: '00000000-0000-4000-8000-000000000102',
            publicMessage,
            reviewedAt: '2026-08-15T00:30:00.000Z',
            status: 'approved',
            statusAccessIssuedAt: issuedAt,
            statusAccessVersion: 3,
            submittedAt: issuedAt,
          })),
        } as never,
        { context: {} } as never,
        {
          identity: {
            getClaimAccount: vi.fn(async () => ({
              authorizationSummary: {},
              recordVersion: 8,
              role: 'member',
              status: 'disabled',
            })),
          } as never,
          now: new Date('2026-08-16T00:00:00.000Z'),
          receipt: receipt(),
          receiptKey: key,
          requestId: 'request-disabled',
        },
      )
    }
    const systemResult = await query(publicMessageDefaults.claimApproved)
    expect(systemResult.status).toBe('accountDisabled')
    expect(systemResult.publicMessage).toContain('当前已停用')
    const managerResult = await query('虚构人工留言：请在周六联系协会。')
    expect(managerResult.publicMessage).toBe('虚构人工留言：请在周六联系协会。')
  })

  it('allows terminal receipt reissue through the exact thirtieth day only', () => {
    const terminal = {
      reviewedAt: '2026-08-01T00:00:00.000Z',
      status: 'approved',
    }
    expect(
      canReissueMembershipStatusReceipt(
        terminal,
        new Date('2026-08-31T00:00:00.000Z'),
      ),
    ).toBe(true)
    expect(
      canReissueMembershipStatusReceipt(
        terminal,
        new Date('2026-08-31T00:00:00.001Z'),
      ),
    ).toBe(false)
  })

  it.each([
    ['invalid', 'invalid'],
    ['replaced', receipt()],
    ['expired', receipt()],
  ])(
    'uses the same NOT_FOUND facade for %s receipts',
    async (scenario, value) => {
      const document = {
        reviewedAt: scenario === 'expired' ? '2026-06-01T00:00:00.000Z' : null,
        status: scenario === 'expired' ? 'rejected' : 'pendingReview',
        statusAccessIssuedAt: issuedAt,
        statusAccessVersion: scenario === 'replaced' ? 4 : 3,
        submittedAt: issuedAt,
      }
      try {
        await queryMembershipStatus(
          { findByID: vi.fn(async () => document) } as never,
          { context: {} } as never,
          {
            identity: {} as never,
            now: new Date('2026-08-15T12:00:00.000Z'),
            receipt: value,
            receiptKey: key,
            requestId: 'request-invalid',
          },
        )
        throw new Error('expected query to fail')
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError)
        expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404 })
      }
    },
  )
})
