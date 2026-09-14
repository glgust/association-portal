export const permissionEffects = ['allow', 'deny'] as const
export const permissionScopes = ['global', 'recruitmentCycle'] as const

export const recruitmentPermissions = [
  'recruitment.application.read',
  'recruitment.application.review',
  'recruitment.form.manage',
] as const

export const contentPermissions = [
  'content.create',
  'content.edit',
  'content.directPublish',
] as const

export const auditPermissions = ['audit.read'] as const

export const identityPermissions = ['accounts.manage'] as const

export const globalOnlyPermissions = [
  ...contentPermissions,
  ...auditPermissions,
  ...identityPermissions,
] as const

export const permissions = [
  ...recruitmentPermissions,
  ...contentPermissions,
  ...auditPermissions,
  ...identityPermissions,
] as const

export type Permission = (typeof permissions)[number]

export function isGlobalOnlyPermission(
  permission: Permission,
): permission is (typeof globalOnlyPermissions)[number] {
  return (globalOnlyPermissions as readonly Permission[]).includes(permission)
}
