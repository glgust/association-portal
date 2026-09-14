import type { Access } from 'payload'

export const memberAccountClaimOperations = {
  approveClaim: 'membership.claim.approve',
  approveIntake: 'membership.intake.approve',
  createMember: 'membership.member.create',
  convertClaimToDirect: 'membership.claim.convert-to-direct',
  disableClaim: 'membership.claim.disable',
  preconfigureClaim: 'membership.claim.preconfigure',
  readStatus: 'membership.status.read',
  readQueue: 'membership.claim.read-queue',
  reissueStatusReceipt: 'membership.status.reissue',
  rejectClaim: 'membership.claim.reject',
  rejectIntake: 'membership.intake.reject',
  reopenClaim: 'membership.claim.reopen',
  submitClaim: 'membership.claim.submit',
  submitIntake: 'membership.intake.submit',
  updatePublicMessage: 'membership.public-message.update',
  withdrawClaimConversion: 'membership.claim.withdraw-conversion',
} as const

export type MemberAccountClaimOperation =
  (typeof memberAccountClaimOperations)[keyof typeof memberAccountClaimOperations]

export function setMemberAccountClaimOperation(
  context: Record<string, unknown>,
  operation: MemberAccountClaimOperation,
): void {
  context.memberAccountClaimOperation = operation
}

export function allowsMemberAccountClaimOperation(
  ...operations: MemberAccountClaimOperation[]
): Access {
  return ({ req }) =>
    operations.includes(req.context.memberAccountClaimOperation as never)
}
