import { z } from 'zod'

const positiveIntegerString = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().safe())

export const publicContentPaginationQuerySchema = z
  .object({
    page: positiveIntegerString.default(1),
    pageSize: positiveIntegerString
      .pipe(z.number().int().min(1).max(50))
      .default(10),
  })
  .strict()
