import { formSchema, type FormSchema } from '@ascnucc/contracts'

export type AnswerValidationResult =
  | { answers: Record<string, string>; success: true }
  | { issues: Array<{ fieldId: string; message: string }>; success: false }

export type InterpretedAnswer = {
  displayValue: string
  fieldId: string
  label: string
}

export function validateAnswers(
  schemaInput: unknown,
  answersInput: unknown,
): AnswerValidationResult {
  const schema = formSchema.parse(schemaInput)
  const issues: Array<{ fieldId: string; message: string }> = []

  if (
    !answersInput ||
    typeof answersInput !== 'object' ||
    Array.isArray(answersInput)
  ) {
    return {
      issues: [{ fieldId: '_form', message: 'Answers must be an object' }],
      success: false,
    }
  }

  const input = answersInput as Record<string, unknown>
  const knownFields = new Set(schema.fields.map((field) => field.fieldId))

  for (const fieldId of Object.keys(input)) {
    if (!knownFields.has(fieldId))
      issues.push({ fieldId, message: 'Unknown field' })
  }

  const answers: Record<string, string> = {}
  for (const field of schema.fields) {
    const value = input[field.fieldId]
    if (value === undefined || value === '') {
      if (field.required)
        issues.push({ fieldId: field.fieldId, message: 'Required field' })
      continue
    }
    if (typeof value !== 'string') {
      issues.push({ fieldId: field.fieldId, message: 'Expected a string' })
      continue
    }

    if (
      'maxLength' in field &&
      field.maxLength &&
      value.length > field.maxLength
    ) {
      issues.push({
        fieldId: field.fieldId,
        message: `Maximum length is ${field.maxLength}`,
      })
      continue
    }
    if (
      field.type === 'select' &&
      !field.options.some((option) => option.optionId === value)
    ) {
      issues.push({ fieldId: field.fieldId, message: 'Unknown option' })
      continue
    }
    answers[field.fieldId] = value
  }

  return issues.length > 0
    ? { issues, success: false }
    : { answers, success: true }
}

export function interpretAnswers(
  schemaInput: unknown,
  answersInput: Record<string, unknown>,
): InterpretedAnswer[] {
  const schema: FormSchema = formSchema.parse(schemaInput)

  return schema.fields.flatMap((field) => {
    const rawValue = answersInput[field.fieldId]
    if (typeof rawValue !== 'string') return []

    const displayValue =
      field.type === 'select'
        ? (field.options.find((option) => option.optionId === rawValue)
            ?.label ?? rawValue)
        : rawValue

    return [{ displayValue, fieldId: field.fieldId, label: field.label }]
  })
}
