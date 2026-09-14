import { describe, expect, it } from 'vitest'

import { down } from '@/migrations/20260810_150000_m010_member_identity_account_claim'

describe('M010 member identity account claim migration', () => {
  it('refuses a destructive down migration', async () => {
    await expect(down({} as never)).rejects.toThrow('M010_DOWN_UNSUPPORTED')
  })
})
