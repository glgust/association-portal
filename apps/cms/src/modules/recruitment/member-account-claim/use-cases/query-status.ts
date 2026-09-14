import { NotFound, type Payload, type PayloadRequest } from 'payload'

import { BusinessError } from '@/modules/shared/business-error'

import {
  memberAccountClaimOperations,
  setMemberAccountClaimOperation,
} from '../business-context'
import type { MemberClaimIdentityPort } from '../identity-port'
import { isSystemPublicMessage } from '../public-messages'
import {
  verifyStatusReceipt,
  type StatusReceiptPayload,
} from '../status-receipt'
import { relationId } from './helpers'
import { terminalStatusReceiptLifetimeMs } from './status-admin'

type StatusDocument = {
  authUser?: null | string | { id: string }
  conversionWithdrawnAt?: null | string
  convertedAt?: null | string
  publicMessage?: null | string
  publicMessageUpdatedAt?: null | string
  reviewedAt?: null | string
  status: 'approved' | 'pendingReview' | 'rejected'
  statusAccessIssuedAt?: null | string
  statusAccessVersion: number
  submittedAt: string
}

const defaultMessages = {
  accountDisabled: '关联账号当前已停用，请通过协会既有线下渠道联系管理员。',
  approvedCanLogin: '审核已通过，现在可以使用你设置的正式密码登录。',
  intakeCompleted: '人工核验已完成，请按协会线下安排继续办理。',
  pendingReview: '申请已提交，正在等待管理员审核。',
  rejectedContactAssociation:
    '本次申请未通过，请通过协会既有线下渠道联系管理员。',
  resubmissionRequired: '请重新设置密码并提交新的账号认领申请。',
  temporaryActivationContactAdmin:
    '认领已转换为临时凭证激活，请联系管理员获取后续安排。',
} as const

const nextSteps = {
  accountDisabled: '请联系管理员确认停用原因和后续恢复方式。',
  approvedCanLogin: '前往 CMS 普通登录区，使用申请时设置的正式密码登录。',
  intakeCompleted: '人工核验不会隐式创建账号；请按留言或线下安排继续。',
  pendingReview: '审核前账号不可登录，请保管查询凭证并稍后再查。',
  rejectedContactAssociation: '请按公开留言通过协会线下渠道联系管理员。',
  resubmissionRequired: '返回账号认领页，重新设置正式密码并提交新申请。',
  temporaryActivationContactAdmin:
    '此查询凭证不能用于激活；请联系管理员确认临时凭证交付。',
} as const

function invalidReceipt(): BusinessError {
  return new BusinessError('NOT_FOUND', 'Status receipt is invalid', 404)
}

async function findStatusDocument(
  payload: Payload,
  req: PayloadRequest,
  receipt: StatusReceiptPayload,
): Promise<StatusDocument> {
  setMemberAccountClaimOperation(
    req.context,
    memberAccountClaimOperations.readStatus,
  )
  try {
    return (await payload.findByID({
      collection:
        receipt.kind === 'claim'
          ? 'account-claims'
          : 'member-intake-applications',
      id: receipt.id,
      overrideAccess: false,
      req,
    })) as unknown as StatusDocument
  } catch (error) {
    if (error instanceof NotFound) throw invalidReceipt()
    throw error
  }
}

function assertReceiptMatches(
  document: StatusDocument,
  receipt: StatusReceiptPayload,
  now: Date,
): void {
  if (
    document.statusAccessVersion !== receipt.version ||
    !document.statusAccessIssuedAt ||
    document.statusAccessIssuedAt !== receipt.issuedAt
  ) {
    throw invalidReceipt()
  }
  if (
    document.status !== 'pendingReview' &&
    (!document.reviewedAt ||
      now.getTime() - new Date(document.reviewedAt).getTime() >
        terminalStatusReceiptLifetimeMs)
  ) {
    throw invalidReceipt()
  }
}

export async function queryMembershipStatus(
  payload: Payload,
  req: PayloadRequest,
  input: {
    identity: MemberClaimIdentityPort
    now: Date
    receipt: string
    receiptKey: string | Uint8Array
    requestId: string
  },
) {
  const receipt = verifyStatusReceipt(input.receiptKey, input.receipt)
  if (!receipt) throw invalidReceipt()
  const document = await findStatusDocument(payload, req, receipt)
  assertReceiptMatches(document, receipt, input.now)

  let status: keyof typeof defaultMessages
  if (document.status === 'pendingReview') {
    status = 'pendingReview'
  } else if (receipt.kind === 'intake') {
    status =
      document.status === 'approved'
        ? 'intakeCompleted'
        : 'rejectedContactAssociation'
  } else {
    const accountId = relationId(document.authUser)
    const account = accountId
      ? await input.identity.getClaimAccount(req, accountId)
      : null
    if (account?.status === 'disabled') status = 'accountDisabled'
    else if (document.conversionWithdrawnAt) status = 'resubmissionRequired'
    else if (document.convertedAt && account?.status === 'active') {
      status = 'approvedCanLogin'
    } else if (
      document.convertedAt &&
      account?.status === 'pendingActivation'
    ) {
      status = 'temporaryActivationContactAdmin'
    } else if (document.status === 'approved' && account?.status === 'active') {
      status = 'approvedCanLogin'
    } else if (account?.status === 'pendingClaim') {
      status = 'resubmissionRequired'
    } else {
      status = 'rejectedContactAssociation'
    }
  }

  return {
    nextStep: nextSteps[status],
    publicMessage:
      !document.publicMessage || isSystemPublicMessage(document.publicMessage)
        ? defaultMessages[status]
        : document.publicMessage,
    requestId: input.requestId,
    status,
    updatedAt:
      document.publicMessageUpdatedAt ??
      document.conversionWithdrawnAt ??
      document.convertedAt ??
      document.reviewedAt ??
      document.submittedAt,
  }
}
