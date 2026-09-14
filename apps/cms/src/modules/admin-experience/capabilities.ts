import { authorize, type Actor } from '@/modules/authorization/authorize'

export type AdminTask = {
  href: string
  id: string
  impact: string
  label: string
  next: string
  when: string
}

export type AdminTaskGroup = {
  id: 'content' | 'legacy' | 'membership' | 'system'
  label: string
  tasks: AdminTask[]
}

const roleLabels = {
  admin: '管理员',
  cadre: '干部',
  member: '会员',
  owner: '所有者',
  staff: '干事',
} as const

const task = (
  id: string,
  label: string,
  href: string,
  when: string,
  impact: string,
  next: string,
): AdminTask => ({ href, id, impact, label, next, when })

export function buildAdminExperience(
  actor: Actor | null,
  now: Date,
  visibleCollections: ReadonlySet<string>,
): { groups: AdminTaskGroup[]; roleLabel: string } {
  if (!actor || actor.status !== 'active') {
    return { groups: [], roleLabel: '未激活账号' }
  }

  const global = (permission: Parameters<typeof authorize>[1]) =>
    authorize(actor, permission, { type: 'global' }, now).allowed
  const canCreateContent = global('content.create')
  const canEditContent = global('content.edit')
  const groups: AdminTaskGroup[] = []

  const membership: AdminTask[] = []
  if (global('accounts.manage')) {
    membership.push(
      task(
        'accounts',
        '账号创建与管理',
        '/admin/accounts',
        '需要直接创建、调整、重置、停用或重新启用后台账号时。',
        '所有变更继续由受控账号 API 执行；临时凭证只在成功后显示一次。',
        '完成后按页面提示交付凭证，或让用户重新登录。',
      ),
    )
  }
  if (
    global('accounts.manage') &&
    (actor.role === 'admin' || actor.role === 'owner')
  ) {
    membership.push(
      task(
        'member-claims',
        '会员账号认领与人工核验',
        '/admin/member-account-claims',
        '线下身份已确认，需要预配置认领账号或处理待审核申请时。',
        '预配置不签发凭证；批准和转换仍遵循既有认领状态机。',
        '审核后查看队列状态，并按页面说明处理登录或凭证交付。',
      ),
    )
  }
  if (global('accounts.manage') && visibleCollections.has('members')) {
    membership.push(
      task(
        'members',
        '会员档案',
        '/admin/collections/members',
        '需要查询已确认会员档案及账号关联时。',
        '这里只展示当前账号有权读取的会员资料，不替代认领或建号流程。',
        '需要账号操作时返回受控账号或认领页面。',
      ),
    )
  }
  if (actor.role === 'member') {
    membership.unshift(
      task(
        'member-account',
        '我的协会账号',
        '/admin/member-account',
        '查看自己的协会身份、账号状态和当前可用功能时。',
        '只显示当前账号的最小资料和服务端授权形成的入口。',
        '从可用功能继续工作，或退出当前账号。',
      ),
    )
  }
  if (membership.length) {
    groups.push({ id: 'membership', label: '会员与账号', tasks: membership })
  }

  const content =
    canCreateContent || canEditContent
      ? [
          ['association-pages', '协会页面'],
          ['announcements', '公告'],
          ['activities', '活动'],
          ['news', '新闻'],
          ['media-assets', '媒体资产'],
          ['gallery-works', '协会画廊'],
        ]
          .filter(([slug]) => visibleCollections.has(slug!))
          .map(([slug, label]) =>
            task(
              slug!,
              label!,
              slug === 'media-assets'
                ? canCreateContent
                  ? '/admin/media-assets'
                  : '/admin/collections/media-assets'
                : `/admin/collections/${slug}${canEditContent ? '' : '/create'}`,
              `需要维护${label}草稿或公开内容时。`,
              slug === 'media-assets' && canCreateContent
                ? '通过受控上传创建完整媒体资产；原始文件不会保留，资产不可就地替换或删除。'
                : canEditContent
                  ? '可以进入列表并按现有内容权限、版本和审计规则维护记录。'
                  : '只能进入新建页；既有记录的列表、编辑、发布与下线仍不可用。',
              slug === 'media-assets' && canCreateContent
                ? '上传成功后在媒体资产列表核对尺寸；随后到协会画廊创建或编辑作品。'
                : canEditContent
                  ? '保存后核对状态；需要公开变更时使用页面提供的发布动作。'
                  : '创建草稿后退出；如需继续编辑或发布，请联系具有 content.edit 的管理员。',
            ),
          )
      : []
  if (content.length) {
    groups.push({ id: 'content', label: '内容管理', tasks: content })
  }

  const system: AdminTask[] = []
  if (global('audit.read') && visibleCollections.has('audit-events')) {
    system.push(
      task(
        'audit',
        '审计记录',
        '/admin/collections/audit-events',
        '需要按请求 ID 或目标记录追查正式管理动作时。',
        '审计记录只读；普通查看工作台不会新增业务审计事件。',
        '记录 requestId 后回到对应受控业务页继续排错。',
      ),
    )
  }
  if (system.length) {
    groups.push({ id: 'system', label: '系统与审计', tasks: system })
  }

  const recruitmentScopeIds = actor.overrides.flatMap((override) =>
    override.scope.type === 'recruitmentCycle'
      ? [override.scope.recruitmentCycleId]
      : [],
  )
  const canReadRecruitment =
    global('recruitment.application.read') ||
    recruitmentScopeIds.some(
      (recruitmentCycleId) =>
        authorize(
          actor,
          'recruitment.application.read',
          { recruitmentCycleId, type: 'recruitmentCycle' },
          now,
        ).allowed,
    )
  const canManageRecruitmentForms = global('recruitment.form.manage')
  const hasEffectiveBusinessCapability =
    global('accounts.manage') ||
    canCreateContent ||
    canEditContent ||
    global('audit.read') ||
    canReadRecruitment ||
    canManageRecruitmentForms
  const legacy: AdminTask[] = []
  if (
    actor.role !== 'member' &&
    hasEffectiveBusinessCapability &&
    visibleCollections.has('demo-pages')
  ) {
    legacy.push(
      task(
        'demo-pages',
        'Demo 页面',
        '/admin/collections/demo-pages',
        '仅在本地演示或工程调试旧页面能力时。',
        '不会进入当前正式会员账号申领流程。',
        '只使用虚构资料；完成调试后返回工作台。',
      ),
    )
  }
  if (canReadRecruitment) {
    if (visibleCollections.has('recruitment-cycles')) {
      legacy.push(
        task(
          'recruitment-cycles',
          '旧招新届次',
          '/admin/collections/recruitment-cycles',
          '需要回看或调试历史招新届次时。',
          '旧招新状态机保持不变，不是正式会员账号入口。',
          '不得录入真实个人资料；正式认领请使用会员账号认领页。',
        ),
      )
    }
    if (visibleCollections.has('membership-applications')) {
      legacy.push(
        task(
          'membership-applications',
          '历史申请',
          '/admin/recruitment-review',
          '需要查看当前授权届次的历史 Demo 申请时。',
          '只沿用旧申请读取和审核权限，不会隐式创建正式账号。',
          '正式身份核验请返回会员账号认领与人工核验。',
        ),
      )
    }
  }
  if (canManageRecruitmentForms) {
    legacy.push(
      task(
        'form-definitions',
        '动态表单定义',
        '/admin/collections/form-definitions',
        '仅在维护历史 Demo 招新表单定义时。',
        '已发布版本仍保持不可变，且与正式会员认领表单无关。',
        '只使用虚构数据验证，完成后返回工作台。',
      ),
    )
  }
  if (legacy.length) {
    groups.push({ id: 'legacy', label: '历史与 Demo', tasks: legacy })
  }

  return { groups, roleLabel: roleLabels[actor.role] }
}

export const demoSafetyNotice =
  '仅用于演示和工程调试，不是当前正式会员身份核验或账号申领入口；不得录入真实个人资料。'
