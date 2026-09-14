import type { AccountRole, Actor } from '@/modules/authorization/authorize'
import { BusinessError } from '@/modules/shared/business-error'

export const temporaryCredentialLifetimeMs = 72 * 60 * 60 * 1000

function validationFailure(message: string, path: string): BusinessError {
  return new BusinessError('VALIDATION_FAILED', message, 400, {
    issues: [{ code: 'custom', message, path: [path] }],
  })
}

export function normalizeLoginName(
  accountType: 'external' | 'student',
  loginName: string,
  studentNumber?: string | null,
): { loginName: string; studentNumber: null | string } {
  const normalized = loginName.trim().toLowerCase()
  if (accountType === 'student') {
    const number = studentNumber?.trim() ?? normalized
    if (!/^[0-9]{6,32}$/.test(number) || normalized !== number) {
      throw validationFailure(
        'Student login name must equal a 6–32 digit student number',
        'studentNumber',
      )
    }
    return { loginName: number, studentNumber: number }
  }
  if (studentNumber) {
    throw validationFailure(
      'External accounts cannot have a student number',
      'studentNumber',
    )
  }
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(normalized)) {
    throw validationFailure(
      'External login name has an invalid format',
      'loginName',
    )
  }
  return { loginName: normalized, studentNumber: null }
}

export function normalizeDisplayName(value: string): string {
  const normalized = value.trim()
  if (normalized.length < 1 || normalized.length > 100) {
    throw validationFailure(
      'Display name must contain 1–100 characters',
      'displayName',
    )
  }
  return normalized
}

export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

export const manageableRoles: Record<AccountRole, readonly AccountRole[]> = {
  cadre: ['member', 'staff'],
  admin: ['member', 'staff', 'cadre'],
  member: [],
  owner: ['member', 'staff', 'cadre', 'admin'],
  staff: [],
}

export function assertCanManage(
  actor: Actor,
  targetId: string | null,
  currentRole: AccountRole | null,
  nextRole: AccountRole,
): void {
  if (targetId === actor.id) {
    throw new BusinessError('FORBIDDEN', 'Self-management is not allowed', 403)
  }
  if (
    (currentRole && !manageableRoles[actor.role].includes(currentRole)) ||
    !manageableRoles[actor.role].includes(nextRole)
  ) {
    throw new BusinessError(
      'FORBIDDEN',
      'Target role exceeds management limit',
      403,
    )
  }
}

export function roleExpiryForTransition(
  currentRole: AccountRole | null,
  nextRole: AccountRole,
  now: Date,
): null | string | undefined {
  if (nextRole !== 'staff') return null
  if (currentRole !== 'staff') return addCalendarMonths(now, 10).toISOString()
  return undefined
}
