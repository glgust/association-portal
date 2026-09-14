import { z } from 'zod'

export const memberAccountLandingSchema = z
  .object({
    capabilities: z.array(
      z.object({ href: z.string(), label: z.string() }).strict(),
    ),
    displayName: z.string(),
    membershipIdentity: z.enum(['member', 'staff', 'cadre']),
    status: z.enum(['active']),
  })
  .strict()
export type MemberAccountLandingSummary = z.infer<
  typeof memberAccountLandingSchema
>
