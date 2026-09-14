import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { canReadAuditEvent } from '@/modules/audit/access'
import { AuditEvents } from '@/modules/audit/collections/AuditEvents'
import { auditOperations } from '@/modules/audit/context'

type Role = 'admin' | 'cadre' | 'owner' | 'staff'

async function canRead({
  accessExpiresAt,
  overrides = [],
  role,
  status = 'active',
}: {
  accessExpiresAt?: string
  overrides?: unknown[]
  role: Role
  status?: 'active' | 'disabled' | 'pendingActivation'
}): Promise<boolean> {
  const req = {
    payload: {
      find: vi.fn().mockResolvedValue({ docs: overrides }),
    } as unknown as Payload,
    user: {
      accessExpiresAt,
      collection: 'auth-users',
      id: 'audit-reader',
      role,
      status,
    },
  } as PayloadRequest

  return Boolean(await canReadAuditEvent({ req } as never))
}

describe('AuditEvent read access', () => {
  it.each(['cadre', 'admin', 'owner'] as const)(
    'uses the unified role default for %s',
    async (role) => {
      await expect(canRead({ role })).resolves.toBe(true)
    },
  )

  it('denies staff by default and permits an explicit global allow', async () => {
    await expect(canRead({ role: 'staff' })).resolves.toBe(false)
    await expect(
      canRead({
        overrides: [
          {
            effect: 'allow',
            id: 'audit-allow',
            permission: 'audit.read',
            scopeType: 'global',
          },
        ],
        role: 'staff',
      }),
    ).resolves.toBe(true)

    await expect(
      canRead({
        overrides: [
          {
            effect: 'allow',
            expiresAt: '2000-01-01T00:00:00.000Z',
            id: 'expired-audit-allow',
            permission: 'audit.read',
            scopeType: 'global',
          },
        ],
        role: 'staff',
      }),
    ).resolves.toBe(false)
  })

  it('keeps deny and inactive account status ahead of role defaults', async () => {
    await expect(
      canRead({
        overrides: [
          {
            effect: 'deny',
            id: 'audit-deny',
            permission: 'audit.read',
            scopeType: 'global',
          },
        ],
        role: 'owner',
      }),
    ).resolves.toBe(false)

    await expect(canRead({ role: 'owner', status: 'disabled' })).resolves.toBe(
      false,
    )
  })
})

describe('AuditEvent create operation whitelist', () => {
  it.each([
    auditOperations.publishAssociationPage,
    auditOperations.unpublishAssociationPage,
  ])('allows the association page operation %s', async (operation) => {
    const result = await AuditEvents.access!.create!({
      req: { context: { auditOperation: operation } },
    } as never)
    expect(result).toBe(true)
  })

  it('does not broaden the whitelist to an unknown content operation', async () => {
    const result = await AuditEvents.access!.create!({
      req: { context: { auditOperation: 'content.publish-anything' } },
    } as never)
    expect(result).toBe(false)
  })
})
