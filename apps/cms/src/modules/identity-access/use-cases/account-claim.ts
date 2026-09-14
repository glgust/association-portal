import { NotFound, type Payload, type PayloadRequest } from 'payload'

import type { AccountRole } from '@/modules/authorization/authorize'
import { BusinessError } from '@/modules/shared/business-error'

import { identityOperations, setIdentityOperation } from '../business-context'
import { generateTemporaryCredential } from '../credentials'
import {
  normalizeDisplayName,
  normalizeLoginName,
  roleExpiryForTransition,
  temporaryCredentialLifetimeMs,
} from '../domain'
import { assertExpectedVersion } from '../guards'
import { passwordSchema } from '../schemas'

export type ClaimAccountStatus =
  | 'active'
  | 'claimBlocked'
  | 'disabled'
  | 'pendingActivation'
  | 'pendingApproval'
  | 'pendingClaim'

export type ClaimAccountResult = {
  defaultRoleExpiresAt: null | string
  id: string
  recordVersion: number
  role: AccountRole
  status: ClaimAccountStatus
}

type ClaimAccountDocument = ClaimAccountResult & {
  accessExpiresAt?: null | string
}

function toResult(account: ClaimAccountDocument): ClaimAccountResult {
  return {
    defaultRoleExpiresAt: account.defaultRoleExpiresAt ?? null,
    id: account.id,
    recordVersion: account.recordVersion,
    role: account.role,
    status: account.status,
  }
}

async function findClaimAccount(
  payload: Payload,
  req: PayloadRequest,
  authUserId: string,
): Promise<ClaimAccountDocument> {
  try {
    return (await payload.findByID({
      collection: 'auth-users',
      id: authUserId,
      overrideAccess: true,
      req,
    })) as ClaimAccountDocument
  } catch (error) {
    if (error instanceof NotFound) {
      throw new BusinessError('NOT_FOUND', 'Account not found', 404)
    }
    throw error
  }
}

export async function getClaimAccountSnapshot(
  payload: Payload,
  req: PayloadRequest,
  authUserId: string,
): Promise<{
  authorizationSummary: Record<string, unknown>
  recordVersion: number
  role: AccountRole
  status: ClaimAccountStatus
}> {
  const account = await findClaimAccount(payload, req, authUserId)
  const overrides = await payload.find({
    collection: 'permission-overrides',
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [{ user: { equals: authUserId } }, { revokedAt: { exists: false } }],
    },
  })
  return {
    authorizationSummary: {
      defaultRoleExpiresAt: account.defaultRoleExpiresAt ?? null,
      overrides: overrides.docs
        .map((override) => ({
          effect: override.effect,
          expiresAt: override.expiresAt ?? null,
          permission: override.permission,
          recruitmentCycleId:
            typeof override.recruitmentCycle === 'string'
              ? override.recruitmentCycle
              : (override.recruitmentCycle?.id ?? null),
          scopeType: override.scopeType,
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        ),
      role: account.role,
    },
    recordVersion: account.recordVersion,
    role: account.role,
    status: account.status,
  }
}

function assertStatus(
  current: ClaimAccountDocument,
  allowed: readonly ClaimAccountStatus[],
): void {
  if (!allowed.includes(current.status)) {
    throw new BusinessError('CONFLICT', 'Account claim state has changed', 409)
  }
}

async function clearSessions(
  payload: Payload,
  req: PayloadRequest,
  authUserId: string,
): Promise<void> {
  await payload.db.updateOne({
    collection: 'auth-users',
    id: authUserId,
    data: { sessions: [] },
    req,
    returning: false,
  })
}

export async function createPendingClaimAccount(
  payload: Payload,
  req: PayloadRequest,
  command: {
    displayName: string
    loginName: string
    role: 'cadre' | 'member' | 'staff'
    studentNumber: string
  },
): Promise<ClaimAccountResult> {
  const identity = normalizeLoginName(
    'student',
    command.loginName,
    command.studentNumber,
  )
  setIdentityOperation(req.context, identityOperations.preconfigureClaim)
  const account = await payload.create({
    collection: 'auth-users',
    data: {
      accountType: 'student',
      accessExpiresAt: null,
      defaultRoleExpiresAt: null,
      displayName: normalizeDisplayName(command.displayName),
      password: generateTemporaryCredential(),
      recordVersion: 1,
      role: command.role,
      status: 'pendingClaim',
      studentNumber: identity.studentNumber,
      temporaryCredentialExpiresAt: null,
      username: identity.loginName,
    },
    overrideAccess: false,
    req,
  })
  return toResult(account as ClaimAccountDocument)
}

export async function submitClaimPassword(
  payload: Payload,
  req: PayloadRequest,
  command: {
    authUserId: string
    expectedVersion: number
    password: string
  },
): Promise<ClaimAccountResult> {
  const current = await findClaimAccount(payload, req, command.authUserId)
  assertExpectedVersion(current.recordVersion, command.expectedVersion)
  assertStatus(current, ['pendingClaim'])
  setIdentityOperation(req.context, identityOperations.submitClaim)
  const updated = await payload.update({
    collection: 'auth-users',
    id: current.id,
    data: {
      password: passwordSchema.parse(command.password),
      recordVersion: current.recordVersion + 1,
      status: 'pendingApproval',
      temporaryCredentialExpiresAt: null,
    },
    overrideAccess: false,
    req,
  })
  await clearSessions(payload, req, current.id)
  return toResult(updated as ClaimAccountDocument)
}

export async function approveClaimAccount(
  payload: Payload,
  req: PayloadRequest,
  command: { authUserId: string; expectedVersion: number; now: Date },
): Promise<ClaimAccountResult> {
  const current = await findClaimAccount(payload, req, command.authUserId)
  assertExpectedVersion(current.recordVersion, command.expectedVersion)
  assertStatus(current, ['pendingApproval'])
  const defaultRoleExpiresAt =
    current.role === 'staff'
      ? (roleExpiryForTransition(null, 'staff', command.now) ?? null)
      : null
  setIdentityOperation(req.context, identityOperations.approveClaim)
  const updated = await payload.update({
    collection: 'auth-users',
    id: current.id,
    data: {
      accessExpiresAt: defaultRoleExpiresAt,
      defaultRoleExpiresAt,
      recordVersion: current.recordVersion + 1,
      status: 'active',
      temporaryCredentialExpiresAt: null,
    },
    overrideAccess: false,
    req,
  })
  return toResult(updated as ClaimAccountDocument)
}

async function replaceCredentialAndSetStatus(
  payload: Payload,
  req: PayloadRequest,
  command: { authUserId: string; expectedVersion: number },
  allowed: readonly ClaimAccountStatus[],
  status: ClaimAccountStatus,
  operation:
    | typeof identityOperations.disableAccount
    | typeof identityOperations.rejectClaim
    | typeof identityOperations.reopenClaim,
): Promise<ClaimAccountResult> {
  const current = await findClaimAccount(payload, req, command.authUserId)
  assertExpectedVersion(current.recordVersion, command.expectedVersion)
  assertStatus(current, allowed)
  setIdentityOperation(req.context, operation)
  const updated = await payload.update({
    collection: 'auth-users',
    id: current.id,
    data: {
      password: generateTemporaryCredential(),
      recordVersion: current.recordVersion + 1,
      status,
      temporaryCredentialExpiresAt: null,
    },
    overrideAccess: false,
    req,
  })
  await clearSessions(payload, req, current.id)
  return toResult(updated as ClaimAccountDocument)
}

export function rejectClaimAccount(
  payload: Payload,
  req: PayloadRequest,
  command: { authUserId: string; expectedVersion: number },
): Promise<ClaimAccountResult> {
  return replaceCredentialAndSetStatus(
    payload,
    req,
    command,
    ['pendingApproval'],
    'claimBlocked',
    identityOperations.rejectClaim,
  )
}

export function reopenClaimAccount(
  payload: Payload,
  req: PayloadRequest,
  command: { authUserId: string; expectedVersion: number },
): Promise<ClaimAccountResult> {
  return replaceCredentialAndSetStatus(
    payload,
    req,
    command,
    ['claimBlocked'],
    'pendingClaim',
    identityOperations.reopenClaim,
  )
}

export function disableClaimAccount(
  payload: Payload,
  req: PayloadRequest,
  command: { authUserId: string; expectedVersion: number },
): Promise<ClaimAccountResult> {
  return replaceCredentialAndSetStatus(
    payload,
    req,
    command,
    ['pendingClaim', 'pendingApproval', 'claimBlocked'],
    'disabled',
    identityOperations.disableAccount,
  )
}

export async function convertClaimToPendingActivation(
  payload: Payload,
  req: PayloadRequest,
  command: { authUserId: string; expectedVersion: number; now: Date },
): Promise<
  ClaimAccountResult & {
    temporaryCredential: string
    temporaryCredentialExpiresAt: string
  }
> {
  const current = await findClaimAccount(payload, req, command.authUserId)
  assertExpectedVersion(current.recordVersion, command.expectedVersion)
  assertStatus(current, ['pendingClaim', 'pendingApproval', 'claimBlocked'])
  const temporaryCredential = generateTemporaryCredential()
  const temporaryCredentialExpiresAt = new Date(
    command.now.getTime() + temporaryCredentialLifetimeMs,
  ).toISOString()
  const defaultRoleExpiresAt =
    current.role === 'staff'
      ? (roleExpiryForTransition(null, 'staff', command.now) ?? null)
      : null
  setIdentityOperation(req.context, identityOperations.convertClaimToDirect)
  const updated = await payload.update({
    collection: 'auth-users',
    id: current.id,
    data: {
      accessExpiresAt: defaultRoleExpiresAt,
      defaultRoleExpiresAt,
      password: temporaryCredential,
      recordVersion: current.recordVersion + 1,
      status: 'pendingActivation',
      temporaryCredentialExpiresAt,
    },
    overrideAccess: false,
    req,
  })
  await clearSessions(payload, req, current.id)
  return {
    ...toResult(updated as ClaimAccountDocument),
    temporaryCredential,
    temporaryCredentialExpiresAt,
  }
}

export async function withdrawClaimConversionAccount(
  payload: Payload,
  req: PayloadRequest,
  command: { authUserId: string; expectedVersion: number },
): Promise<ClaimAccountResult> {
  const current = await findClaimAccount(payload, req, command.authUserId)
  assertExpectedVersion(current.recordVersion, command.expectedVersion)
  assertStatus(current, ['pendingActivation'])
  setIdentityOperation(req.context, identityOperations.withdrawClaimConversion)
  const updated = await payload.update({
    collection: 'auth-users',
    id: current.id,
    data: {
      accessExpiresAt: null,
      defaultRoleExpiresAt: null,
      password: generateTemporaryCredential(),
      recordVersion: current.recordVersion + 1,
      status: 'pendingClaim',
      temporaryCredentialExpiresAt: null,
    },
    overrideAccess: false,
    req,
  })
  await clearSessions(payload, req, current.id)
  return toResult(updated as ClaimAccountDocument)
}
