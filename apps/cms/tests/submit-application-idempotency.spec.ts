import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { submitApplication } from '@/modules/recruitment/use-cases/submit-application'

vi.mock('@/modules/recruitment/use-cases/transaction', () => ({
  inRequestTransaction: (_req: unknown, action: () => unknown) => action(),
}))

const schema = {
  schemaVersion: 1,
  fields: [
    { fieldId: 'name', label: 'Name', type: 'text', required: true },
    { fieldId: 'note', label: 'Note', type: 'textarea', required: false },
  ],
}

function fixture() {
  const existing = {
    id: 'application-id',
    recruitmentCycle: 'cycle-id',
    formVersion: 'version-id',
    answers: { name: 'Fictional member' },
    status: 'approved',
  }
  const payload = {
    find: vi.fn().mockResolvedValue({ totalDocs: 1, docs: [existing] }),
    findByID: vi.fn().mockResolvedValue({ schema }),
    create: vi.fn(),
  }
  const input = {
    command: {
      formVersionId: 'version-id',
      answers: { name: 'Fictional member' },
    },
    recruitmentCycleId: 'cycle-id',
    idempotencyKey: 'same-request-key',
    now: new Date('2026-01-01T00:00:00Z'),
    requestId: 'request-id',
  }
  const submit = () =>
    submitApplication(
      payload as unknown as Payload,
      { context: {} } as PayloadRequest,
      input,
    )
  return { existing, payload, input, submit }
}

describe('legacy application idempotency', () => {
  it('returns the original result for the same normalized request without writes', async () => {
    const f = fixture()
    f.input.command.answers = {
      note: '',
      name: 'Fictional member',
    } as typeof f.input.command.answers
    await expect(f.submit()).resolves.toEqual(f.existing)
    expect(f.payload.create).not.toHaveBeenCalled()
  })

  it.each(['cycle', 'version', 'answers'])(
    'rejects reuse with different %s and makes no writes',
    async (change) => {
      const f = fixture()
      if (change === 'cycle') f.input.recruitmentCycleId = 'another-cycle'
      if (change === 'version')
        f.input.command.formVersionId = 'another-version'
      if (change === 'answers') f.input.command.answers.name = 'Another member'
      await expect(f.submit()).rejects.toMatchObject({
        code: 'CONFLICT',
        status: 409,
      })
      expect(f.payload.create).not.toHaveBeenCalled()
    },
  )

  it('rejects invalid additional answers instead of returning an existing application', async () => {
    const f = fixture()
    f.input.command.answers = {
      name: 'Fictional member',
      unknown: 'data',
    } as typeof f.input.command.answers
    await expect(f.submit()).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
    expect(f.payload.create).not.toHaveBeenCalled()
  })
})
