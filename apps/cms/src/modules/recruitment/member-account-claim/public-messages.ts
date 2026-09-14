export const publicMessageDefaults = {
  claimApproved: '审核已通过，现在可以使用你设置的正式密码登录。',
  claimConverted: '认领已转换为临时凭证激活，请联系管理员获取后续安排。',
  claimRejected: '本次认领未通过，请通过协会既有线下渠道联系管理员。',
  claimReopened: '认领已重新开放，请重新设置正式密码并提交新的认领申请。',
  conversionWithdrawn:
    '临时凭证转换已撤回，请重新设置正式密码并提交新的认领申请。',
  intakeApproved: '人工核验已完成，请按协会线下安排继续办理。',
  intakeRejected: '本次人工核验未通过，请通过协会既有线下渠道联系管理员。',
} as const

const systemPublicMessages = new Set<string>(
  Object.values(publicMessageDefaults),
)

export function isSystemPublicMessage(
  message: null | string | undefined,
): boolean {
  return message != null && systemPublicMessages.has(message)
}
