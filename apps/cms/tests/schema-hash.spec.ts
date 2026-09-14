import { describe, expect, it } from 'vitest'

import { hashFormSchema } from '@/modules/recruitment/form-schema/schema-hash'

describe('hashFormSchema', () => {
  it('is stable when object key order changes', () => {
    const left = {
      fields: [
        { fieldId: 'name', label: '姓名', required: true, type: 'text' },
      ],
      schemaVersion: 1,
    }
    const right = {
      schemaVersion: 1,
      fields: [
        { type: 'text', required: true, label: '姓名', fieldId: 'name' },
      ],
    }

    expect(hashFormSchema(left)).toBe(hashFormSchema(right))
  })

  it('changes when array order changes', () => {
    const original = {
      fields: [
        { fieldId: 'name', type: 'text' },
        { fieldId: 'studentNumber', type: 'text' },
      ],
    }
    const reordered = {
      fields: [...original.fields].reverse(),
    }

    expect(hashFormSchema(original)).not.toBe(hashFormSchema(reordered))
  })
  it('changes when a label, validation rule or option changes', () => {
    const source = {
      fields: [
        {
          fieldId: 'choice',
          label: 'Original',
          required: true,
          type: 'select',
          options: [{ optionId: 'first', label: 'First' }],
        },
      ],
      schemaVersion: 1,
    }
    const originalHash = hashFormSchema(source)
    expect(hashFormSchema(source)).toBe(originalHash)
    for (const patch of [
      { label: 'Changed' },
      { required: false },
      { options: [{ optionId: 'second', label: 'Second' }] },
    ]) {
      expect(
        hashFormSchema({
          ...source,
          fields: [{ ...source.fields[0], ...patch }],
        }),
      ).not.toBe(originalHash)
    }
  })
})
