import type { Payload, PayloadRequest } from 'payload'

import { auditOperations, setAuditOperation } from '@/modules/audit/context'
import { BusinessError } from '@/modules/shared/business-error'

import { identityOperations, setIdentityOperation } from '../business-context'
import { verifyPayloadPassword } from '../credentials'
import { toAccountSummaryDto } from '../dto'
import { normalizeDisplayName } from '../domain'
import { assertExpectedVersion, requireSelf } from '../guards'
import type { SelfDisplayNameCommand, SelfPasswordCommand } from '../schemas'
import { inIdentityTransaction, withAccountLock } from '../transaction'

async function selfAudit(
  payload: Payload,
  req: PayloadRequest,
  input: { action: string; now: Date; requestId: string; userId: string },
) {
  await payload.create({
    collection: 'audit-events',
    data: {
      action: input.action,
      actor: input.userId,
      metadata: { reason: 'self-service' },
      occurredAt: input.now.toISOString(),
      requestId: input.requestId,
      result: 'success',
      targetId: input.userId,
      targetType: 'auth-user',
    },
    overrideAccess: false,
    req,
  })
}

export async function updateOwnDisplayName(
  payload: Payload,
  req: PayloadRequest,
  command: SelfDisplayNameCommand,
  input: { now: Date; requestId: string },
) {
  const self = requireSelf(req)
  return withAccountLock(payload, self.id, () => {
    setIdentityOperation(req.context, identityOperations.selfDisplayName)
    setAuditOperation(req.context, auditOperations.updateOwnDisplayName)
    return inIdentityTransaction(req, async () => {
      const current = await payload.findByID({
        collection: 'auth-users',
        id: self.id,
        overrideAccess: true,
        req,
      })
      assertExpectedVersion(current.recordVersion, command.expectedVersion)
      const updated = await payload.update({
        collection: 'auth-users',
        id: self.id,
        data: {
          displayName: normalizeDisplayName(command.displayName),
          recordVersion: current.recordVersion + 1,
        },
        overrideAccess: false,
        req,
      })
      await selfAudit(payload, req, {
        action: 'identity.account.self-display-name-updated',
        now: input.now,
        requestId: input.requestId,
        userId: self.id,
      })
      return toAccountSummaryDto(updated)
    })
  })
}

export async function changeOwnPassword(
  payload: Payload,
  req: PayloadRequest,
  command: SelfPasswordCommand,
  input: { now: Date; requestId: string },
): Promise<{ changed: true }> {
  const self = requireSelf(req)
  const sid = (self as typeof self & { _sid?: string })._sid
  if (!sid)
    throw new BusinessError('UNAUTHENTICATED', 'Authentication required', 401)
  return withAccountLock(payload, self.id, () => {
    setIdentityOperation(req.context, identityOperations.selfPassword)
    setAuditOperation(req.context, auditOperations.changeOwnPassword)
    return inIdentityTransaction(req, async () => {
      const current = await payload.findByID({
        collection: 'auth-users',
        id: self.id,
        overrideAccess: true,
        req,
        showHiddenFields: true,
      })
      assertExpectedVersion(current.recordVersion, command.expectedVersion)
      if (
        typeof current.hash !== 'string' ||
        typeof current.salt !== 'string' ||
        !(await verifyPayloadPassword(
          command.currentPassword,
          current.salt,
          current.hash,
        ))
      ) {
        throw new BusinessError('UNAUTHENTICATED', 'Authentication failed', 401)
      }
      const activeSession = current.sessions?.find(
        (session) => session.id === sid,
      )
      if (!activeSession)
        throw new BusinessError(
          'UNAUTHENTICATED',
          'Authentication required',
          401,
        )
      await payload.update({
        collection: 'auth-users',
        id: self.id,
        data: {
          password: command.newPassword,
          recordVersion: current.recordVersion + 1,
        },
        overrideAccess: false,
        req,
      })
      await payload.db.updateOne({
        collection: 'auth-users',
        id: self.id,
        data: { sessions: [activeSession] },
        req,
        returning: false,
      })
      await selfAudit(payload, req, {
        action: 'identity.account.self-password-changed',
        now: input.now,
        requestId: input.requestId,
        userId: self.id,
      })
      return { changed: true as const }
    })
  })
}
