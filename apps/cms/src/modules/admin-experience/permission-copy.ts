import type { Permission } from '@/modules/authorization/permissions'

export const permissionCopy = {
  'accounts.manage': {
    label: '账号与权限管理（高风险）',
    usage: '可管理账号状态、角色和个人权限覆盖；只应短期授予可信管理者。',
  },
  'audit.read': {
    label: '读取审计记录',
    usage: '用于按请求 ID 追查正式管理动作，不允许修改审计记录。',
  },
  'content.create': {
    label: '创建内容草稿',
    usage:
      '可新建协会页面、公告、活动、新闻、画廊草稿和受控媒体资产，不代表可以编辑既有记录。',
  },
  'content.directPublish': {
    label: '直接发布或下线内容（高风险）',
    usage: '可把内容公开或下线；操作会影响公开 Web。',
  },
  'content.edit': {
    label: '编辑既有内容',
    usage:
      '可进入内容列表并修改已有草稿或公开内容；可读取媒体资产列表，但上传仍需 content.create。',
  },
  'recruitment.application.read': {
    label: '读取招新申请',
    usage: '读取申请中的个人资料；干事与会员只允许按指定招新届次范围授权。',
  },
  'recruitment.application.review': {
    label: '审核招新申请（高风险）',
    usage: '可对授权范围内的招新申请作出审核决定。',
  },
  'recruitment.form.manage': {
    label: '管理招新表单（高风险）',
    usage: '可维护招新表单定义并发布不可变版本。',
  },
} satisfies Record<Permission, { label: string; usage: string }>

export function permissionLabel(permission: string): string {
  const copy = permissionCopy[permission as Permission]
  return copy ? `${copy.label} · ${permission}` : permission
}

export function permissionUsage(permission: string): string {
  return permissionCopy[permission as Permission]?.usage ?? '未知权限标识。'
}
