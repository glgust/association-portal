import {
  AuthenticationError,
  LockedAuth,
  type Payload,
  type PayloadRequest,
} from 'payload'

import { auditOperations, setAuditOperation } from '@/modules/audit/context'
import { BusinessError } from '@/modules/shared/business-error'

import { identityOperations, setIdentityOperation } from '../business-context'
import type { ActivationCommand } from '../schemas'
import { inIdentityTransaction, withAccountLock } from '../transaction'

export async function activateAccount(
  payload: Payload,
  req: PayloadRequest,
  command: ActivationCommand,
  input: { now: Date; requestId: string },
): Promise<{ activated: true }> {
  const loginName = command.loginName.trim().toLowerCase()
  try {
    const accounts = await payload.find({
      collection: 'auth-users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      select: { username: true },
      where: { username: { equals: loginName } },
    })
    const account = accounts.docs[0]
    if (!account) {
      throw new BusinessError('UNAUTHENTICATED', 'Authentication failed', 401)
    }

    return await withAccountLock(payload, account.id, () => {
      setIdentityOperation(req.context, identityOperations.activate)
      setAuditOperation(req.context, auditOperations.activateAccount)
      req.context.identityActivationLogin = true
      return inIdentityTransaction(req, async () => {
        const login = await payload.login({
          collection: 'auth-users',
          data: {
            password: command.temporaryCredential,
            username: loginName,
          },
          overrideAccess: true,
          req,
        })
        const user = login.user
        if (!user || user.id !== account.id)
          throw new BusinessError(
            'UNAUTHENTICATED',
            'Authentication failed',
            401,
          )
        const updated = await payload.update({
          collection: 'auth-users',
          id: user.id,
          data: {
            password: command.newPassword,
            recordVersion: user.recordVersion + 1,
            status: 'active',
            temporaryCredentialExpiresAt: null,
          },
          overrideAccess: false,
          req,
        })
        await payload.db.updateOne({
          collection: 'auth-users',
          id: updated.id,
          data: { sessions: [] },
          req,
          returning: false,
        })
        await payload.create({
          collection: 'audit-events',
          data: {
            action: 'identity.account.activated',
            actor: updated.id,
            metadata: { reason: 'credential-activation' },
            occurredAt: input.now.toISOString(),
            requestId: input.requestId,
            result: 'success',
            targetId: updated.id,
            targetType: 'auth-user',
          },
          overrideAccess: false,
          req,
        })
        return { activated: true as const }
      })
    })
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof LockedAuth) {
      throw new BusinessError('UNAUTHENTICATED', 'Authentication failed', 401)
    }
    throw error
  } finally {
    delete req.context.identityActivationLogin
  }
}
