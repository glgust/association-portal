import { describe, expect, it, vi } from 'vitest'

import { loadActor } from '@/modules/authorization/load-actor'
import { memberAccountLandingSchema } from '@/modules/identity-access/admin/member-account/schema'
import { memberAccountCapabilities } from '@/modules/recruitment/member-account-claim/admin/member-capabilities'
import { reviewSuccessMessage } from '@/modules/recruitment/member-account-claim/admin/MemberClaimAdminClient'
import { listMemberClaimQueue } from '@/modules/recruitment/member-account-claim/admin/queries'
import {
  adminClaimApi,
  queueResultSchema,
  reviewDetailSchema,
  statusReceiptResultSchema,
} from '@/modules/recruitment/member-account-claim/admin/schemas'
import { convertClaimToDirectSchema } from '@/modules/recruitment/member-account-claim/schemas'

vi.mock('@/modules/authorization/load-actor', () => ({
  loadActor: vi.fn(),
}))

describe('membership account claim admin UI boundaries', () => {
  it('requires an explicit selected claim and effect confirmation for conversion', () => {
    const command = {
      claimId: '00000000-0000-4000-8000-000000000123',
      confirmEffects: true,
      expectedAccountVersion: 8,
      expectedClaimVersion: 4,
      reason: 'policyOrEligibility',
    }
    expect(convertClaimToDirectSchema.parse(command)).toEqual(command)
    expect(() =>
      convertClaimToDirectSchema.parse({ ...command, confirmEffects: false }),
    ).toThrow()
    expect(() =>
      convertClaimToDirectSchema.parse({ ...command, claimId: undefined }),
    ).toThrow()
  })

  it('traverses more than 100 processed records with a stable server cursor and filter', async () => {
    vi.mocked(loadActor).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000009999',
      overrides: [],
      role: 'owner',
      status: 'active',
    })
    const uuid = (index: number) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    const claims = Array.from({ length: 105 }, (_, index) => ({
      authUser: uuid(1000 + index),
      convertedAt: index < 3 ? '2026-08-20T12:00:00.000Z' : null,
      conversionWithdrawnAt: index === 2 ? '2026-08-20T13:00:00.000Z' : null,
      conversionWithdrawnBy:
        index === 2
          ? {
              displayName: '虚构恢复操作者',
              id: '00000000-0000-4000-8000-000000009997',
            }
          : null,
      id: uuid(index + 1),
      member: uuid(2000 + index),
      publicMessage: `虚构公开留言-${index}`,
      publicMessageUpdatedAt: index === 4 ? '2026-08-20T14:00:00.000Z' : null,
      publicMessageUpdatedBy:
        index === 4
          ? {
              displayName: '虚构留言操作者',
              id: '00000000-0000-4000-8000-000000009998',
            }
          : null,
      recordVersion: 4,
      reviewedAt: new Date(
        Date.UTC(2026, 7, 20, 12, 0, 0) - index * 60_000,
      ).toISOString(),
      reviewedBy: {
        displayName: '虚构管理员',
        id: '00000000-0000-4000-8000-000000009999',
      },
      status: index < 3 ? ('rejected' as const) : ('approved' as const),
      statusAccessVersion: 1,
      submittedAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-20T12:00:00.000Z',
    }))
    const find = vi.fn(async (args: Record<string, unknown>) => {
      if (args.pagination === false) {
        return { docs: [], hasNextPage: false, totalDocs: 0 }
      }
      if (args.collection === 'member-intake-applications') {
        return { docs: [], hasNextPage: false, nextPage: null, totalDocs: 0 }
      }
      const page = Number(args.page ?? 1)
      return {
        docs: claims.slice((page - 1) * 100, page * 100),
        hasNextPage: page === 1,
        nextPage: page === 1 ? 2 : null,
        totalDocs: claims.length,
      }
    })
    const findByID = vi.fn(async ({ id }: { id: string }) => {
      const index = Number(id.slice(-12)) - 2000
      return { authUser: uuid(1000 + index), id }
    })
    const identity = {
      getClaimAccount: vi.fn(async (_req: unknown, accountId: string) => {
        const index = Number(accountId.slice(-12)) - 1000
        return {
          authorizationSummary: {},
          recordVersion: 8,
          role: 'member' as const,
          status:
            index === 0
              ? 'pendingActivation'
              : index === 2
                ? 'pendingClaim'
                : 'active',
        }
      }),
    }
    const payload = { find, findByID } as never
    const req = { context: {} } as never
    const ids: string[] = []
    const records: Array<{
      actions: { canConvertToDirect: boolean; canWithdrawConversion: boolean }
      id: string
      processedAt: string
      processedBy: string
      productStatus: string
    }> = []
    let cursor: string | undefined
    do {
      const page = await listMemberClaimQueue(payload, req, {
        identity: identity as never,
        now: new Date('2026-08-21T00:00:00.000Z'),
        processedCursor: cursor,
        processedFilter: 'all',
      })
      ids.push(...page.processed.map((item) => item.id))
      records.push(...page.processed)
      expect(page.processed[0]?.publicMessageSummary).toContain('虚构公开留言')
      cursor = page.processedNextCursor ?? undefined
    } while (cursor)
    expect(ids).toHaveLength(105)
    expect(new Set(ids).size).toBe(105)
    expect(records[0]).toMatchObject({
      id: uuid(5),
      processedAt: '2026-08-20T14:00:00.000Z',
      processedBy: '虚构留言操作者',
    })
    expect(records.find((item) => item.id === uuid(2))).toMatchObject({
      actions: {
        canConvertToDirect: false,
        canWithdrawConversion: false,
      },
      productStatus: '已转换并激活，可以登录',
    })
    expect(records.find((item) => item.id === uuid(3))).toMatchObject({
      actions: {
        canConvertToDirect: false,
        canWithdrawConversion: false,
      },
      processedAt: '2026-08-20T13:00:00.000Z',
      processedBy: '虚构恢复操作者',
      productStatus: '转换已撤回，等待用户重新提交',
    })
    expect(records.find((item) => item.id === uuid(4))).toMatchObject({
      actions: {
        canConvertToDirect: false,
        canWithdrawConversion: false,
      },
      productStatus: '已批准，可使用正式密码登录',
    })

    const followUp = await listMemberClaimQueue(payload, req, {
      identity: identity as never,
      now: new Date('2026-08-21T00:00:00.000Z'),
      processedFilter: 'followUp',
    })
    expect(followUp.processed).toHaveLength(1)
    expect(followUp.processed[0]).toMatchObject({
      actions: {
        canReissueTemporaryCredential: true,
        canWithdrawConversion: true,
      },
      productStatus: '已转换，等待临时凭证激活',
    })
  })

  it('requires the management receipt response to expose its exact expiry', () => {
    expect(
      statusReceiptResultSchema.parse({
        recordVersion: 5,
        statusReceipt: `v1.${'a'.repeat(80)}.${'b'.repeat(43)}`,
        statusReceiptExpiresAt: '2026-08-31T00:00:00.000Z',
      }).statusReceiptExpiresAt,
    ).toBe('2026-08-31T00:00:00.000Z')
    expect(() =>
      statusReceiptResultSchema.parse({
        recordVersion: 5,
        statusReceipt: `v1.${'a'.repeat(80)}.${'b'.repeat(43)}`,
      }),
    ).toThrow()
  })

  it('gives claim and intake rejection different valid next steps', () => {
    expect(reviewSuccessMessage('claim', 'reject')).toContain('重新开放认领')
    expect(reviewSuccessMessage('intake', 'reject')).toContain(
      '重新提交人工核验申请',
    )
    expect(reviewSuccessMessage('intake', 'reject')).not.toContain(
      '重新开放认领',
    )
  })

  it('keeps all management actions under the frozen admin path', () => {
    const paths = Object.values(adminClaimApi).map((value) =>
      typeof value === 'function' ? value('item/id') : value,
    )
    expect(
      paths.every(
        (path) =>
          path.startsWith('/api/v1/admin/member-account-claims') ||
          path.startsWith('/api/v1/admin/accounts/'),
      ),
    ).toBe(true)
  })

  it('rejects extra queue fields and requires stale to be explicit', () => {
    expect(() =>
      queueResultSchema.parse({
        items: [
          {
            accountId: null,
            applicantIdentity: 'member',
            associationIdentity: null,
            canReopen: false,
            id: 'claim-1',
            kind: 'claim',
            recordVersion: 1,
            status: 'pendingReview',
            submittedAt: '2026-08-10T00:00:00.000Z',
            password: 'must-not-pass',
          },
        ],
      }),
    ).toThrow()
    expect(() => reviewDetailSchema.parse({})).toThrow()
  })

  it('accepts only a server-provided active member landing summary', () => {
    expect(
      memberAccountLandingSchema.parse({
        capabilities: [],
        displayName: '林星河',
        membershipIdentity: 'member',
        status: 'active',
      }).capabilities,
    ).toEqual([])
    expect(() =>
      memberAccountLandingSchema.parse({
        capabilities: [],
        displayName: '林星河',
        membershipIdentity: 'member',
        status: 'pendingClaim',
      }),
    ).toThrow()
  })

  it('derives usable member links from effective server authorization', () => {
    const now = new Date('2026-08-10T00:00:00.000Z')
    const capabilities = memberAccountCapabilities(
      {
        id: 'member-account',
        overrides: [
          {
            effect: 'allow',
            permission: 'content.create',
            scope: { type: 'global' },
          },
          {
            effect: 'allow',
            permission: 'recruitment.application.read',
            scope: {
              recruitmentCycleId: 'cycle-fictional',
              type: 'recruitmentCycle',
            },
          },
          {
            effect: 'deny',
            permission: 'audit.read',
            scope: { type: 'global' },
          },
        ],
        role: 'member',
        status: 'active',
      },
      now,
    )
    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: '/admin/collections/news/create',
          label: '新闻新建',
        }),
        expect.objectContaining({ href: '/admin/recruitment-review' }),
      ]),
    )
    expect(JSON.stringify(capabilities)).not.toContain('audit-events')
    expect(JSON.stringify(capabilities)).not.toContain('accounts')
  })

  it('uses content list routes only when edit is effective', () => {
    const capabilities = memberAccountCapabilities(
      {
        id: 'member-editor',
        overrides: [
          {
            effect: 'allow',
            permission: 'content.edit',
            scope: { type: 'global' },
          },
        ],
        role: 'member',
        status: 'active',
      },
      new Date('2026-08-10T00:00:00.000Z'),
    )
    expect(capabilities).toContainEqual({
      href: '/admin/collections/news',
      label: '新闻管理',
    })
  })
})
