import { Buffer } from 'node:buffer'

import type { Payload, PayloadRequest } from 'payload'

import type { AccountClaim, MemberIntakeApplication } from '@/payload-types'
import { roleDefaultPermissions } from '@/modules/authorization/authorize'
import { BusinessError } from '@/modules/shared/business-error'

import { assertMemberClaimTarget, requireMemberClaimManager } from '../guards'
import type { MemberClaimIdentityPort } from '../identity-port'
import { relationId } from '../use-cases/helpers'
import { canReissueMembershipStatusReceipt } from '../use-cases/status-admin'
import {
  processedFilterSchema,
  queueResultSchema,
  reviewActionFactsSchema,
  reviewDetailSchema,
  type ProcessedItem,
  type ReviewDetail,
} from './schemas'

type AuthorizationView = NonNullable<ReviewDetail['authorization']>
type ProcessedFilter = 'all' | 'followUp'
type ProcessedCursor = {
  id: string
  kind: 'claim' | 'intake'
  processedAt: string
}
const processedPageSize = 20

const noActions = {
  canApprove: false,
  canConvertToDirect: false,
  canReject: false,
  canReissueStatusReceipt: false,
  canReissueTemporaryCredential: false,
  canReopen: false,
  canUpdatePublicMessage: false,
  canWithdrawConversion: false,
} as const

function encodeProcessedCursor(item: ProcessedItem) {
  return Buffer.from(
    JSON.stringify({
      id: item.id,
      kind: item.kind,
      processedAt: item.processedAt,
    }),
  ).toString('base64url')
}

function decodeProcessedCursor(value?: string): ProcessedCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.id !== 'string' ||
      !['claim', 'intake'].includes(parsed.kind) ||
      typeof parsed.processedAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.processedAt))
    ) {
      throw new Error('invalid cursor')
    }
    return parsed as ProcessedCursor
  } catch {
    throw new BusinessError(
      'VALIDATION_FAILED',
      'Invalid processed cursor',
      400,
    )
  }
}

function compareProcessed(
  left: Pick<ProcessedItem, 'id' | 'kind' | 'processedAt'>,
  right: Pick<ProcessedItem, 'id' | 'kind' | 'processedAt'>,
) {
  const time = right.processedAt.localeCompare(left.processedAt)
  if (time !== 0) return time
  return `${right.kind}:${right.id}`.localeCompare(`${left.kind}:${left.id}`)
}

function needsFollowUp(item: ProcessedItem) {
  return (
    item.actions.canReopen ||
    item.actions.canReissueTemporaryCredential ||
    item.actions.canWithdrawConversion
  )
}

async function allProcessedClaims(payload: Payload, req: PayloadRequest) {
  const docs: AccountClaim[] = []
  let page = 1
  while (true) {
    const result = await payload.find({
      collection: 'account-claims',
      limit: 100,
      overrideAccess: true,
      page,
      req,
      sort: ['-reviewedAt', '-id'],
      where: { status: { in: ['approved', 'rejected'] } },
    })
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs
    page = result.nextPage ?? page + 1
  }
}

async function allProcessedIntakes(payload: Payload, req: PayloadRequest) {
  const docs: MemberIntakeApplication[] = []
  let page = 1
  while (true) {
    const result = await payload.find({
      collection: 'member-intake-applications',
      limit: 100,
      overrideAccess: true,
      page,
      req,
      sort: ['-reviewedAt', '-id'],
      where: { status: { in: ['approved', 'rejected'] } },
    })
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs
    page = result.nextPage ?? page + 1
  }
}

function authorizationView(value: Record<string, unknown>): AuthorizationView {
  const role = value.role
  if (!['member', 'staff', 'cadre', 'admin'].includes(String(role))) {
    throw new BusinessError(
      'CONFLICT',
      'Authorization snapshot is invalid',
      409,
    )
  }
  const overrides = Array.isArray(value.overrides) ? value.overrides : []
  return {
    defaultPermissions: roleDefaultPermissions(
      role as 'admin' | 'cadre' | 'member' | 'staff',
    ),
    overrides: overrides.map((entry) => {
      const item = entry as Record<string, unknown>
      const cycle = item.recruitmentCycleId
      return {
        effect: item.effect === 'deny' ? ('deny' as const) : ('allow' as const),
        permission: String(item.permission ?? ''),
        scopeLabel:
          item.scopeType === 'recruitmentCycle' && cycle
            ? `recruitmentCycle:${String(cycle)}`
            : 'global',
      }
    }),
    role: role as AuthorizationView['role'],
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function memberById(
  payload: Payload,
  req: PayloadRequest,
  value: unknown,
) {
  const id = relationId(value as never)
  return id
    ? payload.findByID({
        collection: 'members',
        id,
        overrideAccess: true,
        req,
      })
    : null
}

function actorLabel(value: unknown) {
  if (value && typeof value === 'object') {
    const actor = value as Record<string, unknown>
    if (typeof actor.displayName === 'string' && actor.displayName.trim()) {
      return actor.displayName
    }
    if (typeof actor.username === 'string' && actor.username.trim()) {
      return actor.username
    }
  }
  return relationId(value as never) ?? '系统'
}

function latestProcessedEvent(record: {
  convertedAt?: null | string
  conversionWithdrawnAt?: null | string
  conversionWithdrawnBy?: unknown
  publicMessageUpdatedAt?: null | string
  publicMessageUpdatedBy?: unknown
  reviewedAt?: null | string
  reviewedBy?: unknown
  updatedAt: string
}) {
  const events = [
    { at: record.reviewedAt, by: record.reviewedBy },
    {
      at: record.convertedAt,
      by: record.publicMessageUpdatedBy ?? record.reviewedBy,
    },
    { at: record.conversionWithdrawnAt, by: record.conversionWithdrawnBy },
    { at: record.publicMessageUpdatedAt, by: record.publicMessageUpdatedBy },
  ].filter(
    (event): event is { at: string; by: unknown } =>
      typeof event.at === 'string' && Number.isFinite(Date.parse(event.at)),
  )
  const latest = events.reduce<{ at: string; by: unknown } | null>(
    (current, event) => (!current || event.at >= current.at ? event : current),
    null,
  )
  return {
    processedAt: latest?.at ?? record.updatedAt,
    processedBy: actorLabel(latest?.by),
  }
}

function claimActionFacts(
  claim: AccountClaim,
  account: Awaited<ReturnType<MemberClaimIdentityPort['getClaimAccount']>>,
  relationsMatch: boolean,
  now: Date,
) {
  const pendingReview = claim.status === 'pendingReview'
  const terminal = claim.status === 'approved' || claim.status === 'rejected'
  const pendingActivation = account?.status === 'pendingActivation'
  const conversionOpen = Boolean(
    claim.convertedAt && !claim.conversionWithdrawnAt,
  )
  return reviewActionFactsSchema.parse({
    ...noActions,
    canApprove:
      relationsMatch && pendingReview && account?.status === 'pendingApproval',
    canConvertToDirect:
      relationsMatch &&
      !claim.convertedAt &&
      !claim.conversionWithdrawnAt &&
      ['pendingReview', 'rejected'].includes(claim.status) &&
      Boolean(
        account &&
          ['pendingClaim', 'pendingApproval', 'claimBlocked'].includes(
            account.status,
          ),
      ),
    canReject:
      relationsMatch && pendingReview && account?.status === 'pendingApproval',
    canReissueStatusReceipt:
      terminal && canReissueMembershipStatusReceipt(claim, now),
    canReissueTemporaryCredential:
      relationsMatch && conversionOpen && pendingActivation,
    canReopen:
      relationsMatch &&
      claim.status === 'rejected' &&
      !claim.convertedAt &&
      account?.status === 'claimBlocked',
    canUpdatePublicMessage: terminal,
    canWithdrawConversion:
      relationsMatch && conversionOpen && pendingActivation,
  })
}

function intakeActionFacts(intake: MemberIntakeApplication, now: Date) {
  const pendingReview = intake.status === 'pendingReview'
  const terminal = intake.status === 'approved' || intake.status === 'rejected'
  return reviewActionFactsSchema.parse({
    ...noActions,
    canApprove: pendingReview,
    canReject: pendingReview,
    canReissueStatusReceipt:
      terminal && canReissueMembershipStatusReceipt(intake, now),
    canUpdatePublicMessage: terminal,
  })
}

export async function listMemberClaimQueue(
  payload: Payload,
  req: PayloadRequest,
  input: {
    identity: MemberClaimIdentityPort
    now: Date
    processedCursor?: string
    processedFilter?: ProcessedFilter
  },
) {
  await requireMemberClaimManager(payload, req, input.now)
  const processedCursor = decodeProcessedCursor(input.processedCursor)
  const processedFilter = processedFilterSchema.parse(
    input.processedFilter ?? 'all',
  )
  const [claims, intakes, processedClaims, processedIntakes] =
    await Promise.all([
      payload.find({
        collection: 'account-claims',
        limit: 100,
        overrideAccess: true,
        pagination: false,
        req,
        sort: 'submittedAt',
        where: { status: { in: ['pendingReview', 'rejected'] } },
      }),
      payload.find({
        collection: 'member-intake-applications',
        limit: 100,
        overrideAccess: true,
        pagination: false,
        req,
        sort: 'submittedAt',
        where: { status: { equals: 'pendingReview' } },
      }),
      allProcessedClaims(payload, req),
      allProcessedIntakes(payload, req),
    ])
  const claimItems = await Promise.all(
    claims.docs.map(async (claim) => {
      const member = await memberById(payload, req, claim.member)
      const accountId = relationId(claim.authUser)
      const account = accountId
        ? await input.identity.getClaimAccount(req, accountId)
        : null
      const canReopen =
        claim.status === 'rejected' && account?.status === 'claimBlocked'
      if (claim.status !== 'pendingReview' && !canReopen) return null
      return {
        accountId,
        applicantIdentity: claim.applicantIdentity,
        associationIdentity: member?.membershipIdentity ?? null,
        canReopen,
        id: claim.id,
        kind: 'claim' as const,
        recordVersion: claim.recordVersion,
        status: claim.status,
        submittedAt: claim.submittedAt,
      }
    }),
  )
  const intakeItems = await Promise.all(
    intakes.docs.map(async (intake) => {
      const member = await memberById(payload, req, intake.member)
      return {
        accountId: null,
        applicantIdentity: intake.applicantIdentity,
        associationIdentity: member?.membershipIdentity ?? null,
        canReopen: false,
        id: intake.id,
        kind: 'intake' as const,
        recordVersion: intake.recordVersion,
        status: intake.status,
        submittedAt: intake.submittedAt,
      }
    }),
  )
  const processedClaimItems = await Promise.all(
    processedClaims.map(async (claim) => {
      const accountId = relationId(claim.authUser)
      const account = accountId
        ? await input.identity.getClaimAccount(req, accountId)
        : null
      const member = await memberById(payload, req, claim.member)
      const relationsMatch = Boolean(
        accountId && member && relationId(member.authUser) === accountId,
      )
      const actions = claimActionFacts(
        claim,
        account,
        relationsMatch,
        input.now,
      )
      const processedEvent = latestProcessedEvent(claim)
      return {
        accountId,
        accountRecordVersion: account?.recordVersion ?? null,
        actions,
        id: claim.id,
        kind: 'claim' as const,
        processedAt: processedEvent.processedAt,
        processedBy: processedEvent.processedBy,
        productStatus: claim.conversionWithdrawnAt
          ? '转换已撤回，等待用户重新提交'
          : claim.convertedAt && account?.status === 'active'
            ? '已转换并激活，可以登录'
            : claim.convertedAt && account?.status === 'pendingActivation'
              ? '已转换，等待临时凭证激活'
              : claim.status === 'approved' && account?.status === 'active'
                ? '已批准，可使用正式密码登录'
                : claim.status === 'rejected'
                  ? '已拒绝，可按条件重新开放'
                  : '已处理',
        publicMessageSummary: claim.publicMessage?.slice(0, 80) ?? null,
        recordVersion: claim.recordVersion,
      }
    }),
  )
  const processedIntakeItems = processedIntakes.map((intake) => {
    const processedEvent = latestProcessedEvent(intake)
    return {
      accountId: null,
      accountRecordVersion: null,
      actions: intakeActionFacts(intake, input.now),
      id: intake.id,
      kind: 'intake' as const,
      processedAt: processedEvent.processedAt,
      processedBy: processedEvent.processedBy,
      productStatus:
        intake.status === 'approved' ? '人工核验已完成' : '人工核验未通过',
      publicMessageSummary: intake.publicMessage?.slice(0, 80) ?? null,
      recordVersion: intake.recordVersion,
    }
  })
  const allProcessed = [...processedClaimItems, ...processedIntakeItems]
    .filter((item) => processedFilter === 'all' || needsFollowUp(item))
    .sort(compareProcessed)
  const afterCursor = processedCursor
    ? allProcessed.filter((item) => compareProcessed(item, processedCursor) > 0)
    : allProcessed
  const processedPage = afterCursor.slice(0, processedPageSize)
  return queueResultSchema.parse({
    items: [...claimItems.filter((item) => item !== null), ...intakeItems].sort(
      (left, right) => left.submittedAt.localeCompare(right.submittedAt),
    ),
    processed: processedPage,
    processedNextCursor:
      afterCursor.length > processedPageSize && processedPage.length
        ? encodeProcessedCursor(processedPage[processedPage.length - 1])
        : null,
  })
}

export async function getAccountClaimDetail(
  payload: Payload,
  req: PayloadRequest,
  claimId: string,
  input: { identity: MemberClaimIdentityPort; now: Date },
) {
  const actor = await requireMemberClaimManager(payload, req, input.now)
  const claim = await payload.findByID({
    collection: 'account-claims',
    id: claimId,
    overrideAccess: true,
    req,
  })
  const accountId = relationId(claim.authUser)
  const member = await memberById(payload, req, claim.member)
  if (!accountId || !member) {
    throw new BusinessError('CONFLICT', 'Claim relation is unavailable', 409)
  }
  const account = await input.identity.getClaimAccount(req, accountId)
  if (!account) throw new BusinessError('NOT_FOUND', 'Account not found', 404)
  assertMemberClaimTarget(actor, accountId, account.role)
  const relationsMatch = relationId(member.authUser) === accountId
  const currentAuthorization = authorizationView(account.authorizationSummary)
  const submittedAuthorization = authorizationView(
    claim.authorizationSummary as Record<string, unknown>,
  )
  return reviewDetailSchema.parse({
    accountId,
    accountRecordVersion: account.recordVersion,
    accountStatus: account.status,
    actions: claimActionFacts(claim, account, relationsMatch, input.now),
    applicantIdentity: claim.applicantIdentity,
    associationIdentity: member.membershipIdentity ?? null,
    authorization: currentAuthorization,
    authorizationAtSubmission: submittedAuthorization,
    contacts: (claim.contacts ?? []).map((contact) => ({
      isPrimary: contact.isPrimary,
      label: contact.label ?? null,
      type: contact.type,
      value: contact.value,
    })),
    convertedAt: claim.convertedAt ?? null,
    conversionWithdrawnAt: claim.conversionWithdrawnAt ?? null,
    id: claim.id,
    kind: 'claim',
    major: claim.major ?? null,
    memberId: member.id,
    name: claim.status === 'pendingReview' ? member.name : '终态资料已清除',
    publicMessage: claim.publicMessage ?? null,
    recordVersion: claim.recordVersion,
    stale:
      canonical(account.authorizationSummary) !==
      canonical(claim.authorizationSummary),
    status: claim.status,
    studentNumber:
      claim.status === 'pendingReview' ? (member.studentNumber ?? null) : null,
    submittedAt: claim.submittedAt,
  })
}

export async function getMemberIntakeDetail(
  payload: Payload,
  req: PayloadRequest,
  intakeId: string,
  now: Date,
) {
  await requireMemberClaimManager(payload, req, now)
  const intake = await payload.findByID({
    collection: 'member-intake-applications',
    id: intakeId,
    overrideAccess: true,
    req,
  })
  const member = await memberById(payload, req, intake.member)
  return reviewDetailSchema.parse({
    accountId: null,
    accountRecordVersion: null,
    accountStatus: null,
    actions: intakeActionFacts(intake, now),
    applicantIdentity: intake.applicantIdentity,
    associationIdentity: member?.membershipIdentity ?? null,
    authorization: null,
    authorizationAtSubmission: null,
    contacts: (intake.contacts ?? []).map((contact) => ({
      isPrimary: contact.isPrimary,
      label: contact.label ?? null,
      type: contact.type,
      value: contact.value,
    })),
    convertedAt: null,
    conversionWithdrawnAt: null,
    id: intake.id,
    kind: 'intake',
    major: intake.major ?? null,
    memberId: member?.id ?? null,
    name: intake.name ?? '已清除',
    publicMessage: intake.publicMessage ?? null,
    recordVersion: intake.recordVersion,
    stale: false,
    status: intake.status,
    studentNumber: intake.studentNumber ?? null,
    submittedAt: intake.submittedAt,
  })
}
