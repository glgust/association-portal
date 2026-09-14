import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticatedNonMemberRequest } from '@/access/is-authenticated-non-member'
import { DemoPages } from '@/collections/DemoPages'
import { loadActor } from '@/modules/authorization/load-actor'
import { FormVersions } from '@/modules/recruitment/collections/FormVersions'
import { Members } from '@/modules/recruitment/collections/Members'
import { MembershipApplications } from '@/modules/recruitment/collections/MembershipApplications'
import { recruitmentBusinessOperations } from '@/modules/recruitment/business-context'

const memberRequest = { context: {}, user: { role: 'member' } }

vi.mock('@/modules/authorization/load-actor', () => ({ loadActor: vi.fn() }))

const payload = {
  find: vi.fn(async () => ({ docs: [{ id: 'cycle-a' }], totalDocs: 1 })),
}

function actor(
  overrides: Record<string, unknown>[] = [],
  role: 'admin' | 'member' | 'staff' = 'member',
) {
  return { id: 'actor-1', overrides, role, status: 'active' as const }
}

beforeEach(() => {
  vi.clearAllMocks()
  payload.find.mockResolvedValue({ docs: [{ id: 'cycle-a' }], totalDocs: 1 })
})

describe('member generic collection access boundary', () => {
  it('allows authenticated non-members but rejects member and anonymous actors', () => {
    expect(isAuthenticatedNonMemberRequest({ user: { role: 'staff' } })).toBe(
      true,
    )
    expect(isAuthenticatedNonMemberRequest(memberRequest)).toBe(false)
    expect(isAuthenticatedNonMemberRequest({ user: null })).toBe(false)
  })

  it('keeps DemoPages public read while excluding member writes', () => {
    expect(DemoPages.access!.read?.({ req: memberRequest } as never)).toBe(true)
    expect(DemoPages.access!.create?.({ req: memberRequest } as never)).toBe(
      false,
    )
    expect(DemoPages.access!.update?.({ req: memberRequest } as never)).toBe(
      false,
    )
    expect(DemoPages.access!.delete?.({ req: memberRequest } as never)).toBe(
      false,
    )
  })

  it('limits member FormVersion reads to the same published rows as anonymous users', () => {
    const expected = { status: { equals: 'published' } }
    expect(
      FormVersions.access!.read?.({ req: memberRequest } as never),
    ).toEqual(expected)
    expect(
      FormVersions.access!.read?.({
        req: { user: { role: 'staff' } },
      } as never),
    ).toBe(true)
  })

  it('does not let member authentication bypass MembershipApplication access', async () => {
    vi.mocked(loadActor).mockResolvedValue(actor() as never)
    await expect(
      MembershipApplications.access!.read?.({
        req: { ...memberRequest, payload },
      } as never),
    ).resolves.toBe(false)
    await expect(
      MembershipApplications.access!.read?.({
        req: {
          context: {
            recruitmentBusinessOperation:
              recruitmentBusinessOperations.submitApplication,
          },
          payload,
          user: null,
        },
      } as never),
    ).resolves.toBe(true)
  })

  it('limits application PII to allowed cycles and honors explicit deny', async () => {
    vi.mocked(loadActor).mockResolvedValue(
      actor([
        {
          effect: 'allow',
          permission: 'recruitment.application.read',
          scope: { recruitmentCycleId: 'cycle-a', type: 'recruitmentCycle' },
        },
      ]) as never,
    )
    await expect(
      MembershipApplications.access!.read?.({
        req: { context: {}, payload, user: { role: 'member' } },
      } as never),
    ).resolves.toEqual({ recruitmentCycle: { in: ['cycle-a'] } })

    vi.mocked(loadActor).mockResolvedValue(
      actor([
        {
          effect: 'allow',
          permission: 'recruitment.application.read',
          scope: { recruitmentCycleId: 'cycle-a', type: 'recruitmentCycle' },
        },
        {
          effect: 'deny',
          permission: 'recruitment.application.read',
          scope: { recruitmentCycleId: 'cycle-a', type: 'recruitmentCycle' },
        },
      ]) as never,
    )
    await expect(
      MembershipApplications.access!.read?.({
        req: { context: {}, payload, user: { role: 'member' } },
      } as never),
    ).resolves.toBe(false)
  })

  it('requires active global accounts.manage for generic Member PII reads', async () => {
    vi.mocked(loadActor).mockResolvedValue(actor([], 'admin') as never)
    await expect(
      Members.access!.read?.({
        req: { context: {}, payload, user: { role: 'admin' } },
      } as never),
    ).resolves.toBe(true)

    vi.mocked(loadActor).mockResolvedValue(
      actor([
        {
          effect: 'allow',
          permission: 'accounts.manage',
          scope: { type: 'global' },
        },
      ]) as never,
    )
    await expect(
      Members.access!.read?.({
        req: { context: {}, payload, user: { role: 'member' } },
      } as never),
    ).resolves.toBe(false)

    vi.mocked(loadActor).mockResolvedValue(null)
    await expect(
      Members.access!.read?.({
        req: { context: {}, payload, user: { role: 'admin' } },
      } as never),
    ).resolves.toBe(false)
  })
})
