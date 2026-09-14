import type { Payload, PayloadRequest } from 'payload'

import { BusinessError } from '@/modules/shared/business-error'
import { assertCanManage } from '@/modules/identity-access/domain'

import {
  memberAccountClaimOperations,
  setMemberAccountClaimOperation,
} from '../business-context'
import {
  membershipIdentities,
  normalizeContacts,
  normalizeMemberName,
  normalizeOptionalMajor,
  normalizeOptionalStudentNumber,
  type ContactInput,
} from '../domain'
import type { MemberClaimIdentityPort } from '../identity-port'
import type { MemberClaimAuditPort } from '../ports'
import { requireMemberClaimManager } from '../guards'
import type { PreconfigureCommand } from '../schemas'
import {
  inMemberAccountClaimTransaction,
  withMemberClaimLocks,
} from '../transaction'
import { normalizedProfile, relationId } from './helpers'
import { isKnownMemberCreationConflict } from './member-creation-conflict'

type PreconfigurationMember = {
  authUser?: null | string | { id: string }
  confirmedAt?: null | string
  contacts?: ContactInput[] | null
  id: string
  major?: null | string
  membershipIdentity?: null | string
  name: string
  recordVersion?: number
  source?: null | string
  sourceApplication?: null | string | { id: string }
  studentNumber?: null | string
}

function assertCompleteExistingMember(
  member: PreconfigurationMember,
): asserts member is PreconfigurationMember & {
  membershipIdentity: 'cadre' | 'member' | 'staff'
  recordVersion: number
  studentNumber: string
} {
  try {
    const identity = member.membershipIdentity
    const contacts = normalizeContacts(member.contacts ?? [])
    const name = normalizeMemberName(member.name)
    const major = normalizeOptionalMajor(member.major)
    const studentNumber = normalizeOptionalStudentNumber(member.studentNumber)
    const hasConfirmedSource =
      member.source === 'offlineInterview' ||
      member.source === 'manualVerification' ||
      Boolean(relationId(member.sourceApplication))
    const isStoredProfileCanonical =
      name === member.name &&
      studentNumber === member.studentNumber &&
      major === (member.major ?? null) &&
      contacts.length === member.contacts?.length &&
      contacts.every((contact, index) => {
        const stored = member.contacts?.[index]
        return (
          stored?.isPrimary === contact.isPrimary &&
          stored.type === contact.type &&
          stored.value === contact.value &&
          (stored.label ?? undefined) === contact.label
        )
      })

    if (
      !identity ||
      !membershipIdentities.includes(identity as never) ||
      !studentNumber ||
      !member.confirmedAt ||
      !hasConfirmedSource ||
      !Number.isInteger(member.recordVersion) ||
      Number(member.recordVersion) < 1 ||
      !isStoredProfileCanonical ||
      (identity !== 'member' && !major)
    ) {
      throw new Error('incomplete member profile')
    }
  } catch {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'Claim preconfiguration requires a complete confirmed Member profile',
      400,
    )
  }
}

export async function preconfigureMemberAccountClaim(
  payload: Payload,
  req: PayloadRequest,
  input: {
    actorId: string
    audit: MemberClaimAuditPort
    command: PreconfigureCommand
    identity: MemberClaimIdentityPort
    now: Date
    requestId: string
  },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  if (actor.id !== input.actorId) {
    throw new BusinessError('FORBIDDEN', 'Actor context does not match', 403)
  }
  assertCanManage(actor, null, null, input.command.role)
  setMemberAccountClaimOperation(
    req.context,
    memberAccountClaimOperations.preconfigureClaim,
  )
  const newProfile =
    input.command.member.mode === 'create'
      ? normalizedProfile(input.command.member.profile)
      : null
  try {
    return await withMemberClaimLocks(
      payload,
      {
        memberIds:
          input.command.member.mode === 'existing'
            ? [input.command.member.memberId]
            : [],
        memberStudentNumbers: newProfile?.studentNumber
          ? [newProfile.studentNumber]
          : [],
      },
      () =>
        inMemberAccountClaimTransaction(req, async () => {
          let member: PreconfigurationMember
          if (input.command.member.mode === 'existing') {
            member = (await payload.findByID({
              collection: 'members',
              id: input.command.member.memberId,
              overrideAccess: true,
              req,
            })) as unknown as PreconfigurationMember
          } else {
            const profile = newProfile!
            if (profile.studentNumber) {
              const existing = await payload.find({
                collection: 'members',
                limit: 1,
                overrideAccess: true,
                pagination: false,
                req,
                where: { studentNumber: { equals: profile.studentNumber } },
              })
              if (existing.docs.length > 0) {
                throw new BusinessError(
                  'CONFLICT',
                  'Member or account identity already exists',
                  409,
                )
              }
            }
            member = (await payload.create({
              collection: 'members',
              data: {
                confirmedAt: input.now.toISOString(),
                contacts: profile.contacts,
                major: profile.major,
                membershipIdentity:
                  input.command.member.profile.membershipIdentity,
                name: profile.name,
                recordVersion: 1,
                source: input.command.member.profile.source,
                studentNumber: profile.studentNumber,
              },
              overrideAccess: false,
              req,
            })) as unknown as PreconfigurationMember
          }

          if (relationId(member.authUser)) {
            throw new BusinessError(
              'CONFLICT',
              'Member already has an account relationship',
              409,
            )
          }
          assertCompleteExistingMember(member)
          const account = await input.identity.createPendingClaimAccount(req, {
            displayName: member.name,
            loginName: member.studentNumber,
            role: input.command.role,
            studentNumber: member.studentNumber,
          })
          let accountVersion = account.recordVersion
          for (const override of input.command.overrides) {
            const result = await input.identity.setPermissionOverride(req, {
              accountId: account.accountId,
              effect: override.effect,
              expectedVersion: accountVersion,
              expiresAt: override.expiresAt,
              now: input.now,
              permission: override.permission,
              reason: override.reason,
              recruitmentCycleId: override.recruitmentCycleId,
              requestId: input.requestId,
              scopeType: override.scopeType,
            })
            accountVersion = result.accountVersion
          }
          const updatedMember = await payload.update({
            collection: 'members',
            id: member.id,
            data: {
              authUser: account.accountId,
              recordVersion: member.recordVersion + 1,
            },
            overrideAccess: false,
            req,
          })
          await input.audit.append(req, {
            action: 'membership.account-claim.preconfigured',
            actorId: input.actorId,
            metadata: { role: input.command.role, status: 'pendingClaim' },
            occurredAt: input.now,
            requestId: input.requestId,
            targetId: member.id,
            targetType: 'member',
          })
          return {
            accountId: account.accountId,
            accountVersion,
            memberId: updatedMember.id,
            requestId: input.requestId,
            status: 'pendingClaim' as const,
          }
        }),
    )
  } catch (error) {
    if (isKnownMemberCreationConflict(error, { includeAccount: true })) {
      throw new BusinessError(
        'CONFLICT',
        'Member or account identity already exists',
        409,
      )
    }
    throw error
  }
}
