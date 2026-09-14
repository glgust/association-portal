import { describe, expect, it } from 'vitest'

import { keyedRequestFingerprint } from '@/modules/recruitment/member-account-claim/fingerprint'
import { accountClaimOptions } from '@/modules/recruitment/member-account-claim/options'
import {
  preconfigureSchema,
  submitClaimSchema,
  submitIntakeSchema,
} from '@/modules/recruitment/member-account-claim/schemas'

const contact = {
  isPrimary: true,
  type: 'wechat' as const,
  value: 'fictional_wechat',
}

describe('membership account claim strict schemas', () => {
  it('rejects authorization and account target injection on public claim', () => {
    const base = {
      contacts: [contact],
      membershipIdentity: 'staff' as const,
      name: '虚构申请人',
      password: 'Fictional-Passphrase-2026!',
      passwordConfirmation: 'Fictional-Passphrase-2026!',
      studentNumber: '20260001',
    }
    expect(submitClaimSchema.safeParse(base).success).toBe(true)
    for (const injected of [
      { role: 'admin' },
      { status: 'active' },
      { authUserId: '00000000-0000-4000-8000-000000000001' },
      { overrides: [] },
    ]) {
      expect(
        submitClaimSchema.safeParse({ ...base, ...injected }).success,
      ).toBe(false)
    }
    expect(
      submitClaimSchema.safeParse({ ...base, membershipIdentity: 'admin' })
        .success,
    ).toBe(false)
  })

  it('keeps intake password-free and requires privacy purpose confirmation', () => {
    const base = {
      contacts: [contact],
      membershipIdentity: 'member' as const,
      name: '虚构人工核验申请人',
      privacyPurposeConfirmed: true as const,
    }
    expect(submitIntakeSchema.safeParse(base).success).toBe(true)
    expect(
      submitIntakeSchema.safeParse({ ...base, password: 'must-not-exist' })
        .success,
    ).toBe(false)
    expect(
      submitIntakeSchema.safeParse({ ...base, privacyPurposeConfirmed: false })
        .success,
    ).toBe(false)
  })

  it('requires explicit offline confirmation when creating a Member', () => {
    const base = {
      member: {
        mode: 'create' as const,
        offlineInterviewConfirmed: true as const,
        profile: {
          contacts: [contact],
          major: '虚构天文专业',
          membershipIdentity: 'staff' as const,
          name: '虚构线下成员',
          source: 'offlineInterview' as const,
          studentNumber: '20260002',
        },
      },
      role: 'staff' as const,
    }
    expect(preconfigureSchema.safeParse(base).success).toBe(true)
    expect(
      preconfigureSchema.safeParse({
        ...base,
        member: { ...base.member, offlineInterviewConfirmed: false },
      }).success,
    ).toBe(false)
  })
})

describe('membership request fingerprints and options', () => {
  it('uses domain-separated keyed HMAC fingerprints', () => {
    const body = { name: '虚构申请人', studentNumber: '20260001' }
    const claim = keyedRequestFingerprint('fictional-test-key', 'claim', body)
    const intake = keyedRequestFingerprint('fictional-test-key', 'intake', body)
    expect(claim).toMatch(/^[a-f0-9]{64}$/)
    expect(claim).not.toBe(intake)
    expect(claim).not.toContain('20260001')
  })

  it('returns exactly the three public identities and role default summaries', () => {
    const options = accountClaimOptions((role) =>
      role === 'member' ? [] : [`fictional-${role}-default`],
    )
    expect(options.map(({ id }) => id)).toEqual(['member', 'staff', 'cadre'])
    expect(options[0].defaultPermissions).toEqual([])
    expect(JSON.stringify(options)).not.toContain('admin')
    expect(JSON.stringify(options)).not.toContain('owner')
    expect(JSON.stringify(options)).not.toContain('override')
  })
})
