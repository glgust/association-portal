import { describe, expect, it, vi } from 'vitest'

import { auditOperations } from '@/modules/audit/context'
import {
  createMemberClaimAuditPort,
  createMemberClaimIdentityPort,
} from '@/modules/recruitment/member-account-claim/adapters'

describe('membership account claim adapters', () => {
  it('builds a stable authorization summary without account secrets', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            effect: 'allow',
            expiresAt: null,
            permission: 'content.edit',
            recruitmentCycleId: null,
            scopeType: 'global',
          },
        ],
      }),
      findByID: vi.fn().mockResolvedValue({
        defaultRoleExpiresAt: null,
        hash: 'fictional-hash-must-not-escape',
        id: '00000000-0000-4000-8000-000000000001',
        recordVersion: 3,
        role: 'staff',
        salt: 'fictional-salt-must-not-escape',
        status: 'pendingApproval',
      }),
    }
    const result = await createMemberClaimIdentityPort(
      payload as never,
    ).getClaimAccount(
      { context: {} } as never,
      '00000000-0000-4000-8000-000000000001',
    )

    expect(payload.findByID).toHaveBeenCalled()
    expect(result).toMatchObject({
      authorizationSummary: {
        defaultRoleExpiresAt: null,
        role: 'staff',
      },
      recordVersion: 3,
      role: 'staff',
      status: 'pendingApproval',
    })
    expect(JSON.stringify(result)).not.toContain('fictional-hash')
    expect(JSON.stringify(result)).not.toContain('fictional-salt')
  })

  it('writes audit events through the narrow audited collection operation', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-id' })
    const req = { context: {} } as never
    await createMemberClaimAuditPort({ create } as never).append(req, {
      action: 'membership.account-claim.reopened',
      actorId: '00000000-0000-4000-8000-000000000002',
      metadata: { reason: 'insufficientEvidence' },
      occurredAt: new Date('2026-08-10T00:00:00.000Z'),
      requestId: 'fictional-request-id',
      targetId: '00000000-0000-4000-8000-000000000003',
      targetType: 'auth-user',
    })

    expect((req as { context: Record<string, unknown> }).context).toMatchObject(
      {
        auditOperation: auditOperations.reopenAccountClaim,
      },
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'audit-events',
        overrideAccess: false,
      }),
    )
    expect(JSON.stringify(create.mock.calls)).not.toContain('password')
    expect(JSON.stringify(create.mock.calls)).not.toContain('contact')
  })
})
