import { describe, expect, it } from 'vitest'

import {
  interpretAnswers,
  validateAnswers,
} from '@/modules/recruitment/form-schema/answers'
import {
  preventFormVersionDelete,
  protectFormVersion,
} from '@/modules/recruitment/form-schema/hooks'

const v1 = {
  fields: [
    {
      fieldId: 'fullName',
      label: '姓名',
      required: true,
      type: 'text' as const,
    },
    {
      fieldId: 'interest',
      label: '兴趣方向',
      options: [
        { label: '观测', optionId: 'observing' },
        { label: '摄影', optionId: 'photography' },
      ],
      required: true,
      type: 'select' as const,
    },
  ],
  schemaVersion: 1 as const,
}

describe('form version rules', () => {
  it('validates answers against the requested snapshot', () => {
    expect(
      validateAnswers(v1, { fullName: '测试同学', interest: 'observing' }),
    ).toEqual({
      answers: { fullName: '测试同学', interest: 'observing' },
      success: true,
    })
    expect(
      validateAnswers(v1, { fullName: '测试同学', interest: 'unknown' }),
    ).toMatchObject({
      success: false,
    })
    expect(
      validateAnswers(v1, {
        fullName: '测试同学',
        interest: 'observing',
        status: 'approved',
      }),
    ).toMatchObject({ success: false })
  })

  it('interprets history using each original version label and option', () => {
    const v2 = {
      ...v1,
      fields: v1.fields.map((field) =>
        field.fieldId === 'interest'
          ? {
              ...field,
              label: '最感兴趣的方向',
              options:
                field.type === 'select'
                  ? [{ label: '天文观测', optionId: 'observing' }]
                  : [],
            }
          : field,
      ),
    }
    const answers = { fullName: '测试同学', interest: 'observing' }

    expect(interpretAnswers(v1, answers)[1]).toMatchObject({
      displayValue: '观测',
      label: '兴趣方向',
    })
    expect(interpretAnswers(v2, answers)[1]).toMatchObject({
      displayValue: '天文观测',
      label: '最感兴趣的方向',
    })
  })

  it('fills a deterministic hash and rejects update/delete', () => {
    const created = protectFormVersion({
      data: { schema: v1 },
      operation: 'create',
    } as never)
    expect(created).toMatchObject({
      schemaHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })

    expect(() =>
      protectFormVersion({ data: {}, operation: 'update' } as never),
    ).toThrow('immutable')
    expect(() => preventFormVersionDelete({} as never)).toThrow(
      'cannot be deleted',
    )
  })
})
