import type { Access } from 'payload'

export const auditOperations = {
  activateAccount: 'identity.activate-account',
  changeOwnPassword: 'identity.change-own-password',
  createAccount: 'identity.create-account',
  disableAccount: 'identity.disable-account',
  manageAccount: 'identity.manage-account',
  resetAccount: 'identity.reset-account',
  reissueTemporaryCredential: 'identity.reissue-temporary-credential',
  setPermissionOverride: 'identity.set-permission-override',
  updateOwnDisplayName: 'identity.update-own-display-name',
  approveAccountClaim: 'membership.approve-account-claim',
  approveMemberIntake: 'membership.approve-member-intake',
  approveApplication: 'recruitment.approve-application',
  convertClaimToDirect: 'membership.convert-claim-to-direct',
  preconfigureAccountClaim: 'membership.preconfigure-account-claim',
  publishActivity: 'content.publish-activity',
  publishAnnouncement: 'content.publish-announcement',
  publishAssociationPage: 'content.publish-association-page',
  publishGallery: 'content.publish-gallery',
  publishNews: 'content.publish-news',
  rejectAccountClaim: 'membership.reject-account-claim',
  rejectMemberIntake: 'membership.reject-member-intake',
  reopenAccountClaim: 'membership.reopen-account-claim',
  reissueStatusReceipt: 'membership.reissue-status-receipt',
  submitAccountClaim: 'membership.submit-account-claim',
  submitApplication: 'recruitment.submit-application',
  submitMemberIntake: 'membership.submit-member-intake',
  updatePublicMessage: 'membership.update-public-message',
  withdrawClaimConversion: 'membership.withdraw-claim-conversion',
  unpublishActivity: 'content.unpublish-activity',
  unpublishAnnouncement: 'content.unpublish-announcement',
  unpublishAssociationPage: 'content.unpublish-association-page',
  unpublishGallery: 'content.unpublish-gallery',
  unpublishNews: 'content.unpublish-news',
} as const

export type AuditOperation =
  (typeof auditOperations)[keyof typeof auditOperations]

export function setAuditOperation(
  context: Record<string, unknown>,
  operation: AuditOperation,
): void {
  context.auditOperation = operation
}

export function allowsAuditOperation(...operations: AuditOperation[]): Access {
  return ({ req }) => operations.includes(req.context.auditOperation as never)
}
