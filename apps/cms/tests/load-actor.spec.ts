import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'

function request(
  role: 'admin' | 'cadre' | 'owner' | 'staff' = 'staff',
): PayloadRequest {
  return {
    user: {
      collection: 'auth-users',
      id: 'user-1',
      role,
      status: 'active',
    },
  } as PayloadRequest
}

function payloadWithOverrides(docs: unknown[]): Payload {
  return {
    find: vi.fn().mockResolvedValue({ docs }),
  } as unknown as Payload
}

function globalOverride(id: string, effect: 'allow' | 'deny' = 'allow') {
  return {
    effect,
    id,
    permission: 'content.directPublish',
    scopeType: 'global',
  }
}

describe('loadActor', () => {
  it('loads every permission override without a 100-row truncation', async () => {
    const docs = Array.from({ length: 100 }, (_, index) =>
      globalOverride(`allow-${index}`),
    )
    docs.push(globalOverride('deny-after-first-page', 'deny'))
    const payload = payloadWithOverrides(docs)

    const actor = await loadActor(payload, request())

    expect(actor?.overrides).toHaveLength(101)
    expect(actor?.overrides.at(-1)?.effect).toBe('deny')
    expect(
      authorize(
        actor!,
        'content.directPublish',
        { type: 'global' },
        new Date('2026-07-14T00:00:00.000Z'),
      ),
    ).toEqual({ allowed: false, reason: 'explicit_deny' })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: false }),
    )
  })

  it.each([
    {
      effect: 'allow',
      id: 'global-only-content-with-cycle',
      permission: 'content.directPublish',
      recruitmentCycle: 'cycle-1',
      scopeType: 'recruitmentCycle',
    },
    {
      effect: 'deny',
      id: 'global-only-audit-with-cycle',
      permission: 'audit.read',
      recruitmentCycle: 'cycle-1',
      scopeType: 'recruitmentCycle',
    },
    {
      effect: 'allow',
      id: 'missing-cycle',
      permission: 'recruitment.application.review',
      scopeType: 'recruitmentCycle',
    },
    {
      effect: 'deny',
      id: 'missing-cycle-deny',
      permission: 'recruitment.application.review',
      scopeType: 'recruitmentCycle',
    },
    {
      effect: 'allow',
      id: 'global-with-cycle',
      permission: 'recruitment.application.review',
      recruitmentCycle: 'cycle-1',
      scopeType: 'global',
    },
    {
      effect: 'deny',
      id: 'global-with-cycle-deny',
      permission: 'recruitment.application.review',
      recruitmentCycle: 'cycle-1',
      scopeType: 'global',
    },
  ])('fails closed for malformed $effect scope data: $id', async (override) => {
    await expect(
      loadActor(payloadWithOverrides([override]), request()),
    ).resolves.toBeNull()
  })

  it('preserves a valid recruitment-cycle scope', async () => {
    const actor = await loadActor(
      payloadWithOverrides([
        {
          effect: 'deny',
          id: 'cycle-deny',
          permission: 'recruitment.application.review',
          recruitmentCycle: { id: 'cycle-1' },
          scopeType: 'recruitmentCycle',
        },
      ]),
      request(),
    )

    expect(actor?.overrides[0]?.scope).toEqual({
      recruitmentCycleId: 'cycle-1',
      type: 'recruitmentCycle',
    })
  })
})
