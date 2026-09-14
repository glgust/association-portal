import type { Access, FieldAccess } from 'payload'

export const identityOperations = {
  activate: 'identity.activate',
  approveClaim: 'identity.approve-claim',
  convertClaimToDirect: 'identity.convert-claim-to-direct',
  createAccount: 'identity.create-account',
  disableAccount: 'identity.disable-account',
  manageAccount: 'identity.manage-account',
  preconfigureClaim: 'identity.preconfigure-claim',
  rejectClaim: 'identity.reject-claim',
  reissueTemporaryCredential: 'identity.reissue-temporary-credential',
  reopenClaim: 'identity.reopen-claim',
  resetCredential: 'identity.reset-credential',
  selfDisplayName: 'identity.self-display-name',
  selfPassword: 'identity.self-password',
  setOverride: 'identity.set-override',
  submitClaim: 'identity.submit-claim',
  withdrawClaimConversion: 'identity.withdraw-claim-conversion',
} as const

export type IdentityOperation =
  (typeof identityOperations)[keyof typeof identityOperations]

export function setIdentityOperation(
  context: Record<string, unknown>,
  operation: IdentityOperation,
): void {
  context.identityOperation = operation
}

export function allowsIdentityOperation(
  ...operations: IdentityOperation[]
): Access {
  return ({ req }) =>
    operations.includes(req.context.identityOperation as IdentityOperation)
}

export function allowsIdentityFieldOperation(
  ...operations: IdentityOperation[]
): FieldAccess {
  return ({ req }) =>
    operations.includes(req?.context?.identityOperation as IdentityOperation)
}
