export const membershipIdentities = ['member', 'staff', 'cadre'] as const
export type MembershipIdentity = (typeof membershipIdentities)[number]

export const memberSources = ['offlineInterview', 'manualVerification'] as const
export type MemberSource = (typeof memberSources)[number]

export const contactTypes = ['phone', 'wechat', 'qq', 'other'] as const
export type ContactType = (typeof contactTypes)[number]

export const applicationReviewStatuses = [
  'pendingReview',
  'approved',
  'rejected',
] as const

export const claimRejectionReasons = [
  'identityMismatch',
  'duplicateOrExistingAccount',
  'insufficientEvidence',
  'policyOrEligibility',
  'applicantRequest',
  'other',
] as const

export type ContactInput = {
  isPrimary: boolean
  label?: null | string
  type: ContactType
  value: string
}

export type NormalizedContact = {
  isPrimary: boolean
  label?: string
  type: ContactType
  value: string
}

export type ReviewStatus = (typeof applicationReviewStatuses)[number]

export function assertReviewTransition(
  current: ReviewStatus,
  next: ReviewStatus,
): void {
  if (
    current !== 'pendingReview' ||
    (next !== 'approved' && next !== 'rejected')
  ) {
    throw new BusinessError(
      'CONFLICT',
      `Review transition is not allowed: ${current} -> ${next}`,
      409,
    )
  }
}

const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u

function normalizeText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = value.normalize('NFKC').trim()
  if (controlCharacters.test(normalized)) {
    throw new Error(`${field} must not contain control characters`)
  }
  if (normalized.length < 1 || normalized.length > maxLength) {
    throw new Error(`${field} must contain 1-${maxLength} characters`)
  }
  return normalized
}

export function normalizeMemberName(value: string): string {
  return normalizeText(value, 'name', 100)
}

export function normalizeOptionalStudentNumber(
  value: null | string | undefined,
): null | string {
  if (value === null || value === undefined || value.trim() === '') return null
  const normalized = value.trim()
  if (!/^[0-9]{6,32}$/.test(normalized)) {
    throw new Error('student number must contain 6-32 ASCII digits')
  }
  return normalized
}

export function normalizeOptionalMajor(
  value: null | string | undefined,
): null | string {
  if (value === null || value === undefined || value.trim() === '') return null
  return normalizeText(value, 'major', 120)
}

export function normalizeContacts(
  contacts: readonly ContactInput[],
): NormalizedContact[] {
  if (contacts.length < 1 || contacts.length > 10) {
    throw new Error('contacts must contain 1-10 entries')
  }
  if (contacts.filter(({ isPrimary }) => isPrimary).length !== 1) {
    throw new Error('contacts must contain exactly one primary entry')
  }

  return contacts.map((contact) => {
    if (!contactTypes.includes(contact.type)) {
      throw new Error('contact type is invalid')
    }
    const value = normalizeText(contact.value, 'contact value', 200)
    const suppliedLabel = contact.label?.trim()
    if (contact.type === 'other' && !suppliedLabel) {
      throw new Error('other contact label is required')
    }
    const label = suppliedLabel
      ? normalizeText(suppliedLabel, 'contact label', 60)
      : undefined
    return {
      isPrimary: contact.isPrimary,
      ...(label ? { label } : {}),
      type: contact.type,
      value,
    }
  })
}
import { BusinessError } from '@/modules/shared/business-error'
