import type { Payload, PayloadRequest } from 'payload'

import { BusinessError } from '@/modules/shared/business-error'

import {
  normalizeContacts,
  normalizeMemberName,
  normalizeOptionalMajor,
  normalizeOptionalStudentNumber,
  type ContactInput,
} from '../domain'

export function relationId(
  value: null | string | undefined | { id: string },
): null | string {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

export function normalizedProfile(input: {
  contacts: readonly ContactInput[]
  major?: null | string
  name: string
  studentNumber?: null | string
}) {
  return {
    contacts: normalizeContacts(input.contacts),
    major: normalizeOptionalMajor(input.major),
    name: normalizeMemberName(input.name),
    studentNumber: normalizeOptionalStudentNumber(input.studentNumber),
  }
}

export async function requireAccountClaim(
  payload: Payload,
  req: PayloadRequest,
  claimId: string,
) {
  try {
    return await payload.findByID({
      collection: 'account-claims',
      id: claimId,
      overrideAccess: true,
      req,
    })
  } catch {
    throw new BusinessError('NOT_FOUND', 'Account claim was not found', 404)
  }
}
