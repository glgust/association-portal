import { z } from 'zod'

const stableIdentifier = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)

const fieldBase = {
  fieldId: stableIdentifier,
  helpText: z.string().max(300).optional(),
  label: z.string().min(1).max(100),
  required: z.boolean(),
}

export const textFieldSchema = z
  .object({
    ...fieldBase,
    maxLength: z.number().int().min(1).max(500).optional(),
    type: z.literal('text'),
  })
  .strict()

export const textareaFieldSchema = z
  .object({
    ...fieldBase,
    maxLength: z.number().int().min(1).max(5000).optional(),
    type: z.literal('textarea'),
  })
  .strict()

export const selectFieldSchema = z
  .object({
    ...fieldBase,
    options: z
      .array(
        z
          .object({
            label: z.string().min(1).max(100),
            optionId: stableIdentifier,
          })
          .strict(),
      )
      .min(1)
      .max(50),
    type: z.literal('select'),
  })
  .strict()

export const formFieldSchema = z.discriminatedUnion('type', [
  textFieldSchema,
  textareaFieldSchema,
  selectFieldSchema,
])

export const formSchema = z
  .object({
    fields: z.array(formFieldSchema).min(1).max(30),
    schemaVersion: z.literal(1),
  })
  .strict()
  .superRefine((value, context) => {
    const fieldIds = new Set<string>()

    value.fields.forEach((field, fieldIndex) => {
      if (fieldIds.has(field.fieldId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate fieldId: ${field.fieldId}`,
          path: ['fields', fieldIndex, 'fieldId'],
        })
      }
      fieldIds.add(field.fieldId)

      if (field.type === 'select') {
        const optionIds = new Set<string>()
        field.options.forEach((option, optionIndex) => {
          if (optionIds.has(option.optionId)) {
            context.addIssue({
              code: 'custom',
              message: `Duplicate optionId: ${option.optionId}`,
              path: ['fields', fieldIndex, 'options', optionIndex, 'optionId'],
            })
          }
          optionIds.add(option.optionId)
        })
      }
    })
  })

export type FormSchema = z.infer<typeof formSchema>
export type FormField = z.infer<typeof formFieldSchema>
