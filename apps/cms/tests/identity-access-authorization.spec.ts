import { describe, expect, it } from 'vitest'

import {
  authorize,
  type AccountRole,
  type Actor,
  type Permission,
  type PermissionScope,
} from '@/modules/authorization/authorize'

const now = new Date('2026-07-27T00:00:00.000Z')
const globalScope: PermissionScope = { type: 'global' }
const cycleScope: PermissionScope = {
  recruitmentCycleId: 'fictional-cycle',
  type: 'recruitmentCycle',
}

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'fictional-user',
    overrides: [],
    role: 'staff',
    status: 'active',
    ...overrides,
  }
}

const roleMatrix: Record<AccountRole, readonly Permission[]> = {
  member: [],
  staff: ['content.create', 'content.edit', 'content.directPublish'],
  cadre: [
    'content.create',
    'content.edit',
    'content.directPublish',
    'recruitment.application.read',
    'recruitment.application.review',
    'audit.read',
  ],
  admin: [
    'content.create',
    'content.edit',
    'content.directPublish',
    'recruitment.application.read',
    'recruitment.form.manage',
    'audit.read',
    'accounts.manage',
  ],
  owner: [
    'content.create',
    'content.edit',
    'content.directPublish',
    'recruitment.application.read',
    'recruitment.application.review',
    'recruitment.form.manage',
    'audit.read',
    'accounts.manage',
  ],
}

const allPermissions = [...new Set(Object.values(roleMatrix).flat())]

function scopeFor(permission: Permission): PermissionScope {
  return permission.startsWith('recruitment.') ? cycleScope : globalScope
}

describe('identity-access authorization policy', () => {
  it.each(Object.keys(roleMatrix) as AccountRole[])(
    'matches the frozen %s role preset exactly',
    (role) => {
      for (const permission of allPermissions) {
        expect(
          authorize(actor({ role }), permission, scopeFor(permission), now)
            .allowed,
          `${role} / ${permission}`,
        ).toBe(roleMatrix[role].includes(permission))
      }
    },
  )

  it('removes only an expired staff preset while preserving an explicit allow', () => {
    const expiredStaff = actor({ defaultRoleExpiresAt: now })
    expect(authorize(expiredStaff, 'content.edit', globalScope, now)).toEqual({
      allowed: false,
      reason: 'role_missing',
    })

    expiredStaff.overrides.push({
      effect: 'allow',
      permission: 'content.edit',
      scope: globalScope,
    })
    expect(authorize(expiredStaff, 'content.edit', globalScope, now)).toEqual({
      allowed: true,
      reason: 'explicit_allow',
    })
    expect(
      authorize(
        actor({ defaultRoleExpiresAt: now, role: 'cadre' }),
        'audit.read',
        globalScope,
        now,
      ).reason,
    ).toBe('role_default')
  })

  it.each([
    'pendingActivation',
    'pendingClaim',
    'pendingApproval',
    'claimBlocked',
    'disabled',
  ] as const)(
    'fails closed for a %s account even with an explicit allow',
    (status) => {
      expect(
        authorize(
          actor({
            overrides: [
              {
                effect: 'allow',
                permission: 'accounts.manage',
                scope: globalScope,
              },
            ],
            role: 'owner',
            status,
          }),
          'accounts.manage',
          globalScope,
          now,
        ),
      ).toEqual({ allowed: false, reason: 'account_inactive' })
    },
  )

  it('keeps accounts.manage global-only for role defaults and overrides', () => {
    expect(
      authorize(actor({ role: 'owner' }), 'accounts.manage', cycleScope, now),
    ).toEqual({ allowed: false, reason: 'invalid_scope' })
    expect(
      authorize(
        actor({
          overrides: [
            {
              effect: 'allow',
              permission: 'accounts.manage',
              scope: cycleScope,
            },
          ],
        }),
        'accounts.manage',
        cycleScope,
        now,
      ),
    ).toEqual({ allowed: false, reason: 'invalid_scope' })
  })
})
