import { authorize, type Actor } from '@/modules/authorization/authorize'

export function memberAccountCapabilities(actor: Actor, now: Date) {
  const capabilities: Array<{ href: string; label: string }> = []
  const allowed = (permission: Parameters<typeof authorize>[1]) =>
    authorize(actor, permission, { type: 'global' }, now).allowed

  const canCreateContent = allowed('content.create')
  const canEditContent = allowed('content.edit')
  if (canCreateContent || canEditContent) {
    const route = (slug: string) =>
      `/admin/collections/${slug}${canEditContent ? '' : '/create'}`
    const label = (name: string) => `${name}${canEditContent ? '管理' : '新建'}`
    capabilities.push(
      { href: route('announcements'), label: label('公告') },
      { href: route('news'), label: label('新闻') },
      { href: route('activities'), label: label('活动') },
      { href: route('association-pages'), label: label('固定页面') },
    )
  }
  if (allowed('audit.read')) {
    capabilities.push({
      href: '/admin/collections/audit-events',
      label: '审计记录',
    })
  }

  const recruitmentScopes = actor.overrides.flatMap((override) =>
    override.scope.type === 'recruitmentCycle'
      ? [override.scope.recruitmentCycleId]
      : [],
  )
  if (
    recruitmentScopes.some(
      (recruitmentCycleId) =>
        authorize(
          actor,
          'recruitment.application.read',
          { recruitmentCycleId, type: 'recruitmentCycle' },
          now,
        ).allowed,
    )
  ) {
    capabilities.push({
      href: '/admin/recruitment-review',
      label: '查看授权届次申请',
    })
  }
  return capabilities
}
