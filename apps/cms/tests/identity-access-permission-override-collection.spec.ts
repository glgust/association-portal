import { ValidationError } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  PermissionOverrides,
  validatePermissionOverrideBeforeChange,
  validatePermissionOverrideBeforeValidate,
} from '@/modules/authorization/collections/PermissionOverrides'
import { BusinessError } from '@/modules/shared/business-error'
import { isActiveOverrideUniqueViolation } from '@/modules/identity-access/use-cases/permission-overrides'

const hooks = [
  validatePermissionOverrideBeforeValidate,
  validatePermissionOverrideBeforeChange,
] as const

function validOverride(overrides: Record<string, unknown> = {}) {
  return {
    effect: 'allow',
    grantedAt: '2026-07-27T00:00:00.000Z',
    grantedBy: '10000000-0000-4000-8000-000000000001',
    permission: 'content.edit',
    reason: '虚构测试授权原因',
    recruitmentCycle: null,
    revokedAt: null,
    revokedBy: null,
    scopeType: 'global',
    user: '10000000-0000-4000-8000-000000000002',
    ...overrides,
  }
}

async function runHook(
  hook: (typeof hooks)[number],
  options: {
    data?: Record<string, unknown>
    operation?: 'create' | 'update'
    originalDoc?: Record<string, unknown>
  } = {},
) {
  return hook({
    data: options.data ?? validOverride(),
    operation: options.operation ?? 'create',
    originalDoc: options.originalDoc,
  } as never)
}

async function expectValidationFailure(
  hook: (typeof hooks)[number],
  options: Parameters<typeof runHook>[1],
) {
  try {
    await runHook(hook, options)
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessError)
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 })
    return
  }
  throw new Error('Expected permission override validation to fail')
}

describe('PermissionOverride collection invariants', () => {
  it('recognizes active uniqueness from structure without localized messages', () => {
    expect(
      isActiveOverrideUniqueViolation(
        new ValidationError({
          errors: [
            {
              message: '值必须是唯一的',
              path: 'user_id, permission',
            },
          ],
        }),
        'global',
      ),
    ).toBe(true)
    expect(
      isActiveOverrideUniqueViolation(
        new ValidationError({
          errors: [
            {
              message: '任意本地化文案',
              path: 'user_id, permission, recruitment_cycle_id',
            },
          ],
        }),
        'recruitmentCycle',
      ),
    ).toBe(true)
    expect(
      isActiveOverrideUniqueViolation(
        new ValidationError({
          errors: [{ message: '值必须是唯一的', path: 'unrelated' }],
        }),
        'global',
      ),
    ).toBe(false)
  })

  it('allows only the two controlled identity operations to update overrides', () => {
    expect(
      PermissionOverrides.access!.update?.({
        req: { context: { identityOperation: 'identity.manage-account' } },
      } as never),
    ).toBe(true)
    expect(
      PermissionOverrides.access!.update?.({
        req: { context: { identityOperation: 'identity.set-override' } },
      } as never),
    ).toBe(true)
    expect(
      PermissionOverrides.access!.update?.({ req: { context: {} } } as never),
    ).toBe(false)
  })

  it('registers both invariant hooks independently of collection access', () => {
    expect(PermissionOverrides.hooks?.beforeValidate).toContain(
      validatePermissionOverrideBeforeValidate,
    )
    expect(PermissionOverrides.hooks?.beforeChange).toContain(
      validatePermissionOverrideBeforeChange,
    )
  })

  it('keeps legacy attribution fields nullable at the Payload field layer', () => {
    for (const name of ['reason', 'grantedBy', 'grantedAt']) {
      const field = PermissionOverrides.fields.find(
        (candidate) => 'name' in candidate && candidate.name === name,
      )
      expect(
        field && 'required' in field ? field.required : undefined,
      ).not.toBe(true)
    }
  })

  it.each(hooks)(
    'requires complete non-blank grant attribution on create in both hook layers',
    async (hook) => {
      await expect(runHook(hook)).resolves.toMatchObject(validOverride())

      for (const data of [
        validOverride({ reason: '   ' }),
        validOverride({ grantedBy: null }),
        validOverride({ grantedAt: null }),
      ]) {
        await expectValidationFailure(hook, { data })
      }
    },
  )

  it.each(hooks)(
    'preserves complete grant attribution and rejects clearing or rewriting it',
    async (hook) => {
      const originalDoc = validOverride()
      await expect(
        runHook(hook, {
          data: {
            grantedAt: new Date('2026-07-27T00:00:00.000Z'),
            grantedBy: { id: originalDoc.grantedBy },
            reason: originalDoc.reason,
            revokedAt: '2026-07-28T00:00:00.000Z',
            revokedBy: '10000000-0000-4000-8000-000000000003',
          },
          operation: 'update',
          originalDoc,
        }),
      ).resolves.toBeDefined()

      for (const data of [
        { reason: null },
        { reason: '改写原因' },
        { grantedBy: '10000000-0000-4000-8000-000000000004' },
        { grantedAt: '2026-07-27T00:00:01.000Z' },
      ]) {
        await expectValidationFailure(hook, {
          data,
          operation: 'update',
          originalDoc,
        })
      }
    },
  )

  it.each(hooks)(
    'allows a legacy all-null triple to remain null but never fabricates it',
    async (hook) => {
      const originalDoc = validOverride({
        grantedAt: null,
        grantedBy: null,
        reason: null,
      })
      await expect(
        runHook(hook, {
          data: { expiresAt: '2026-08-01T00:00:00.000Z' },
          operation: 'update',
          originalDoc,
        }),
      ).resolves.toBeDefined()

      await expectValidationFailure(hook, {
        data: {
          grantedAt: '2026-07-27T00:00:00.000Z',
          grantedBy: '10000000-0000-4000-8000-000000000001',
          reason: '补造归因',
        },
        operation: 'update',
        originalDoc,
      })

      await expectValidationFailure(hook, {
        data: { expiresAt: null },
        operation: 'update',
        originalDoc: validOverride({ grantedAt: null }),
      })
    },
  )

  it.each(hooks)(
    'requires revokedBy and revokedAt to be present or absent together',
    async (hook) => {
      await expectValidationFailure(hook, {
        data: validOverride({
          revokedAt: '2026-07-28T00:00:00.000Z',
          revokedBy: null,
        }),
      })
      await expectValidationFailure(hook, {
        data: validOverride({
          revokedAt: null,
          revokedBy: '10000000-0000-4000-8000-000000000003',
        }),
      })
    },
  )

  it.each(hooks)(
    'enforces structural scope and global-only permissions in both hook layers',
    async (hook) => {
      const cycleId = '20000000-0000-4000-8000-000000000001'
      await expect(
        runHook(hook, {
          data: validOverride({
            permission: 'recruitment.application.read',
            recruitmentCycle: cycleId,
            scopeType: 'recruitmentCycle',
          }),
        }),
      ).resolves.toBeDefined()

      for (const data of [
        validOverride({ recruitmentCycle: cycleId }),
        validOverride({
          permission: 'recruitment.application.read',
          scopeType: 'recruitmentCycle',
        }),
        validOverride({
          permission: 'accounts.manage',
          recruitmentCycle: cycleId,
          scopeType: 'recruitmentCycle',
        }),
      ]) {
        await expectValidationFailure(hook, { data })
      }
    },
  )

  it('keeps the relationship-field validator as an independent scope guard', () => {
    const field = PermissionOverrides.fields.find(
      (candidate) =>
        'name' in candidate && candidate.name === 'recruitmentCycle',
    )
    expect(field && 'validate' in field && field.validate).toBeTypeOf(
      'function',
    )
    if (!field || !('validate' in field) || !field.validate) return

    expect(
      field.validate('20000000-0000-4000-8000-000000000001', {
        siblingData: {
          permission: 'accounts.manage',
          scopeType: 'recruitmentCycle',
        },
      } as never),
    ).toBe('This permission only supports global scope.')
  })
})
