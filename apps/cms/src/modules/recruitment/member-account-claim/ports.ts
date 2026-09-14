import type { PayloadRequest } from 'payload'

export interface MemberClaimAuditPort {
  append(
    req: PayloadRequest,
    event: {
      action: string
      actorId?: string
      metadata?: Record<string, unknown>
      occurredAt: Date
      requestId: string
      targetId: string
      targetType: string
    },
  ): Promise<void>
}
