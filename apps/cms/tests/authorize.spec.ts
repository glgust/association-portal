import { describe, expect, it } from 'vitest'

import {
  authorize,
  type Actor,
  type Permission,
  type PermissionScope,
} from '@/modules/authorization/authorize'
import { globalOnlyPermissions } from '@/modules/authorization/permissions'

const now = new Date('2026-07-13T00:00:00.000Z')
const globalScope: PermissionScope = { type: 'global' }
const cycleScope: PermissionScope = {
  recruitmentCycleId: 'cycle-a',
  type: 'recruitmentCycle',
}
const contentPermissions = [
  'content.create',
  'content.edit',
  'content.directPublish',
] as const
const accountRoles = ['staff', 'cadre', 'admin', 'owner'] as const

function permission(value: string): Permission {
  return value as Permission
}

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'user-1',
    overrides: [],
    role: 'staff',
    status: 'active',
    ...overrides,
  }
}

describe('authorize', () => {
  it.each(accountRoles)(
    'grants every content permission to the %s role in global scope',
    (role) => {
      for (const contentPermission of contentPermissions) {
        expect(
          authorize(
            actor({ role }),
            permission(contentPermission),
            globalScope,
            now,
          ),
        ).toEqual({ allowed: true, reason: 'role_default' })
      }
    },
  )

  it.each(['cadre', 'admin', 'owner'] as const)(
    'grants audit.read to the %s role by default',
    (role) => {
      expect(
        authorize(actor({ role }), 'audit.read', globalScope, now),
      ).toEqual({ allowed: true, reason: 'role_default' })
    },
  )

  it.each(globalOnlyPermissions)(
    'fails closed when global-only permission %s is requested in a recruitment cycle',
    (globalOnlyPermission) => {
      expect(
        authorize(
          actor({ role: 'owner' }),
          globalOnlyPermission,
          cycleScope,
          now,
        ),
      ).toEqual({ allowed: false, reason: 'invalid_scope' })
    },
  )

  it('keeps audit.read out of staff defaults but supports allow, deny and expiry', () => {
    expect(authorize(actor(), 'audit.read', globalScope, now).allowed).toBe(
      false,
    )

    const allowed = actor({
      overrides: [
        { effect: 'allow', permission: 'audit.read', scope: globalScope },
      ],
    })
    expect(authorize(allowed, 'audit.read', globalScope, now).reason).toBe(
      'explicit_allow',
    )

    allowed.overrides.push({
      effect: 'deny',
      permission: 'audit.read',
      scope: globalScope,
    })
    expect(authorize(allowed, 'audit.read', globalScope, now).reason).toBe(
      'explicit_deny',
    )

    expect(
      authorize(
        actor({ role: 'owner', status: 'disabled' }),
        'audit.read',
        globalScope,
        now,
      ).reason,
    ).toBe('account_inactive')
  })

  it('keeps explicit deny ahead of explicit allow and role defaults for content', () => {
    const contentPermission = permission('content.directPublish')
    const decision = authorize(
      actor({
        overrides: [
          {
            effect: 'allow',
            permission: contentPermission,
            scope: globalScope,
          },
          {
            effect: 'deny',
            permission: contentPermission,
            scope: globalScope,
          },
        ],
        role: 'owner',
      }),
      contentPermission,
      globalScope,
      now,
    )

    expect(decision).toEqual({ allowed: false, reason: 'explicit_deny' })
  })

  it('ignores an expired content allow override at the expiry boundary', () => {
    const contentPermission = permission('content.edit')
    const decision = authorize(
      actor({
        overrides: [
          {
            effect: 'allow',
            expiresAt: now,
            permission: contentPermission,
            scope: globalScope,
          },
        ],
      }),
      contentPermission,
      globalScope,
      now,
    )

    expect(decision).toEqual({ allowed: true, reason: 'role_default' })
  })

  it('removes staff role defaults when the default role has expired', () => {
    const decision = authorize(
      actor({
        defaultRoleExpiresAt: now,
        role: 'staff',
      }),
      permission('content.directPublish'),
      globalScope,
      now,
    )

    expect(decision).toEqual({ allowed: false, reason: 'role_missing' })
  })

  it('does not apply a recruitment-cycle override to global content', () => {
    const contentPermission = permission('content.create')
    const decision = authorize(
      actor({
        overrides: [
          {
            effect: 'allow',
            permission: contentPermission,
            scope: cycleScope,
          },
        ],
      }),
      contentPermission,
      globalScope,
      now,
    )

    expect(decision).toEqual({ allowed: true, reason: 'role_default' })
  })

  it('keeps review out of staff and admin role defaults', () => {
    expect(
      authorize(actor(), 'recruitment.application.review', cycleScope, now)
        .allowed,
    ).toBe(false)
    expect(
      authorize(
        actor({ role: 'admin' }),
        'recruitment.application.review',
        cycleScope,
        now,
      ).allowed,
    ).toBe(false)
  })

  it('allows cadre and owner review by role default', () => {
    expect(
      authorize(
        actor({ role: 'cadre' }),
        'recruitment.application.review',
        cycleScope,
        now,
      ).allowed,
    ).toBe(true)
    expect(
      authorize(
        actor({ role: 'owner' }),
        'recruitment.application.review',
        cycleScope,
        now,
      ).allowed,
    ).toBe(true)
  })

  it('applies allow, expiry, scope and deny precedence deterministically', () => {
    const permission = 'recruitment.application.review' as const
    const permitted = actor({
      overrides: [
        {
          effect: 'allow',
          permission,
          scope: cycleScope,
        },
      ],
    })
    expect(authorize(permitted, permission, cycleScope, now).reason).toBe(
      'explicit_allow',
    )
    expect(
      authorize(
        permitted,
        permission,
        { recruitmentCycleId: 'cycle-b', type: 'recruitmentCycle' },
        now,
      ).allowed,
    ).toBe(false)

    permitted.overrides.push({
      effect: 'deny',
      permission,
      scope: { type: 'global' },
    })
    expect(authorize(permitted, permission, cycleScope, now).reason).toBe(
      'explicit_deny',
    )

    expect(
      authorize(
        actor({
          overrides: [
            {
              effect: 'allow',
              expiresAt: now,
              permission,
              scope: { type: 'global' },
            },
          ],
        }),
        permission,
        cycleScope,
        now,
      ).allowed,
    ).toBe(false)
  })

  it('keeps explicit allow after staff default role expiry', () => {
    const expiredStaff = actor({
      defaultRoleExpiresAt: new Date('2026-07-12T23:59:59.000Z'),
      overrides: [
        {
          effect: 'allow',
          permission: 'recruitment.application.review',
          scope: { type: 'global' },
        },
      ],
      role: 'staff',
    })

    expect(
      authorize(expiredStaff, 'recruitment.application.review', cycleScope, now)
        .reason,
    ).toBe('explicit_allow')
  })

  it.each(['member', 'staff'] as const)(
    'never grants accounts.manage to %s through a stored override',
    (role) => {
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
            role,
          }),
          'accounts.manage',
          globalScope,
          now,
        ),
      ).toEqual({ allowed: false, reason: 'role_missing' })
    },
  )

  it.each(['member', 'staff'] as const)(
    'does not let a stored global recruitment read override bypass cycle scope for %s',
    (role) => {
      expect(
        authorize(
          actor({
            overrides: [
              {
                effect: 'allow',
                permission: 'recruitment.application.read',
                scope: globalScope,
              },
            ],
            role,
          }),
          'recruitment.application.read',
          cycleScope,
          now,
        ).allowed,
      ).toBe(false)
    },
  )
})
