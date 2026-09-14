import { describe, expect, it } from 'vitest'

import { Members } from '@/modules/recruitment/collections/Members'
import {
  AccountClaims,
  MemberIntakeApplications,
} from '@/modules/recruitment/member-account-claim/collections'

function field(collection: typeof Members, name: string) {
  return collection.fields.find(
    (candidate) => 'name' in candidate && candidate.name === name,
  )
}

describe('membership account claim collections', () => {
  it('keeps historical Member identity fields nullable in storage', () => {
    expect(field(Members, 'studentNumber')).not.toMatchObject({
      required: true,
    })
    expect(field(Members, 'sourceApplication')).not.toMatchObject({
      required: true,
    })
    expect(field(Members, 'membershipIdentity')).not.toMatchObject({
      required: true,
    })
    expect(field(Members, 'contacts')).not.toMatchObject({ required: true })
    expect(field(Members, 'authUser')).toMatchObject({ unique: true })
    expect(field(Members, 'recordVersion')).toMatchObject({
      defaultValue: 1,
      required: true,
    })
  })

  it('registers terminal claim and intake states without password fields', () => {
    for (const collection of [AccountClaims, MemberIntakeApplications]) {
      const status = field(collection as typeof Members, 'status')
      expect(status).toMatchObject({
        options: ['pendingReview', 'approved', 'rejected'],
        required: true,
      })
      const names = collection.fields.flatMap((candidate) =>
        'name' in candidate ? [candidate.name] : [],
      )
      expect(names).not.toContain('password')
      expect(names).not.toContain('hash')
      expect(names).not.toContain('salt')
      expect(names).toContain('requestFingerprint')
      expect(names).toContain('recordVersion')
    }
  })
})
