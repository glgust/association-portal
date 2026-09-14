import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { AuthUsers } from '@/collections/AuthUsers'
import { PermissionOverrides } from '@/modules/authorization/collections'
import type { AccountRole, Actor } from '@/modules/authorization/authorize'
import {
  buildAdminExperience,
  demoSafetyNotice,
} from '@/modules/admin-experience/capabilities'
import { FormVersions } from '@/modules/recruitment/collections'
import { ReviewActions } from '@/modules/recruitment/collections/ReviewActions'
import { Activities } from '@/modules/content/activities/collections'
import { Announcements } from '@/modules/content/announcements/collections'
import { AssociationPages } from '@/modules/content/association-pages/collections'
import { News } from '@/modules/content/news/collections'
import { permissionCopy } from '@/modules/admin-experience/permission-copy'
import { permissions } from '@/modules/authorization/permissions'
import {
  AccountClaims,
  MemberIntakeApplications,
} from '@/modules/recruitment/member-account-claim/collections'

const now = new Date('2026-08-12T00:00:00.000Z')
const visibleCollections = new Set([
  'activities',
  'announcements',
  'association-pages',
  'audit-events',
  'demo-pages',
  'form-definitions',
  'members',
  'membership-applications',
  'news',
  'recruitment-cycles',
])

function actor(role: AccountRole, overrides: Actor['overrides'] = []): Actor {
  return {
    id: `${role}-fictional`,
    overrides,
    role,
    status: 'active',
  }
}

const visibleByRole: Record<AccountRole, ReadonlySet<string>> = {
  admin: visibleCollections,
  cadre: new Set([
    'activities',
    'announcements',
    'association-pages',
    'audit-events',
    'demo-pages',
    'membership-applications',
    'news',
    'recruitment-cycles',
  ]),
  member: new Set(),
  owner: visibleCollections,
  staff: new Set([
    'activities',
    'announcements',
    'association-pages',
    'demo-pages',
    'news',
  ]),
}

function experience(role: AccountRole) {
  return buildAdminExperience(actor(role), now, visibleByRole[role])
}

function groupIds(role: AccountRole) {
  return experience(role).groups.map((group) => group.id)
}

function taskIds(role: AccountRole) {
  return experience(role).groups.flatMap((group) =>
    group.tasks.map((task) => task.id),
  )
}

describe('CMS admin experience capability model', () => {
  it.each([
    ['owner', ['membership', 'content', 'system', 'legacy']],
    ['admin', ['membership', 'content', 'system', 'legacy']],
    ['cadre', ['content', 'system', 'legacy']],
    ['staff', ['content', 'legacy']],
    ['member', ['membership']],
  ] as const)(
    'derives the %s navigation groups from server authorization',
    (role, expected) => {
      expect(groupIds(role)).toEqual(expected)
    },
  )

  it('keeps account and claim management limited to the authorized roles', () => {
    expect(taskIds('owner')).toEqual(
      expect.arrayContaining(['accounts', 'member-claims']),
    )
    expect(taskIds('admin')).toEqual(
      expect.arrayContaining(['accounts', 'member-claims']),
    )
    expect(taskIds('cadre')).not.toContain('accounts')
    expect(taskIds('cadre')).not.toContain('member-claims')
    expect(taskIds('staff')).not.toContain('accounts')
    expect(taskIds('member')).not.toContain('accounts')
  })

  it('includes complete task guidance and only links visible collections', () => {
    const result = experience('owner')
    for (const group of result.groups) {
      for (const task of group.tasks) {
        expect(task.label).not.toHaveLength(0)
        expect(task.when).not.toHaveLength(0)
        expect(task.impact).not.toHaveLength(0)
        expect(task.next).not.toHaveLength(0)
        expect(task.href).toMatch(/^\/admin(?:\/|$)/)
      }
    }

    const reduced = buildAdminExperience(actor('staff'), now, new Set(['news']))
    expect(reduced.groups).toEqual([
      expect.objectContaining({
        id: 'content',
        tasks: [expect.objectContaining({ id: 'news' })],
      }),
    ])
  })

  it('fails closed for missing, disabled, pending, and expired actors', () => {
    expect(buildAdminExperience(null, now, visibleCollections).groups).toEqual(
      [],
    )
    for (const status of [
      'disabled',
      'pendingActivation',
      'pendingApproval',
      'pendingClaim',
      'claimBlocked',
    ] as const) {
      expect(
        buildAdminExperience({ ...actor('owner'), status }, now, new Set())
          .groups,
      ).toEqual([])
    }
    expect(
      buildAdminExperience(
        {
          ...actor('staff'),
          defaultRoleExpiresAt: new Date(now.getTime() - 1),
        },
        now,
        new Set(['demo-pages', 'news']),
      ).groups,
    ).toEqual([])
  })

  it('respects explicit allow, deny, expiry, and recruitment scope', () => {
    const scoped = buildAdminExperience(
      actor('member', [
        {
          effect: 'allow',
          permission: 'content.edit',
          scope: { type: 'global' },
        },
        {
          effect: 'deny',
          permission: 'content.edit',
          scope: { type: 'global' },
        },
        {
          effect: 'allow',
          expiresAt: now,
          permission: 'audit.read',
          scope: { type: 'global' },
        },
        {
          effect: 'allow',
          permission: 'recruitment.application.read',
          scope: {
            recruitmentCycleId: 'fictional-cycle',
            type: 'recruitmentCycle',
          },
        },
      ]),
      now,
      visibleCollections,
    )
    const ids = scoped.groups.flatMap((group) =>
      group.tasks.map((task) => task.id),
    )
    expect(ids).toContain('member-account')
    expect(ids).toContain('membership-applications')
    expect(ids).not.toContain('news')
    expect(ids).not.toContain('audit')
  })

  it('keeps the historical warning explicit and stable', () => {
    expect(demoSafetyNotice).toContain('仅用于演示和工程调试')
    expect(demoSafetyNotice).toContain('不是当前正式会员身份核验或账号申领入口')
    expect(demoSafetyNotice).toContain('不得录入真实个人资料')
  })
})

describe('internal Payload collections stay out of generic Admin navigation', () => {
  it.each([
    ['auth-users', AuthUsers],
    ['account-claims', AccountClaims],
    ['member-intake-applications', MemberIntakeApplications],
  ] as const)(
    'keeps the original hidden route closure for %s',
    (_, collection) => {
      expect(collection.admin?.hidden).toBe(true)
      expect(collection.admin?.group).not.toBe(false)
      expect(collection.access).toBeDefined()
    },
  )

  it.each([
    ['permission-overrides', PermissionOverrides],
    ['review-actions', ReviewActions],
    ['form-versions', FormVersions],
  ] as const)(
    'removes %s from navigation while preserving its Admin route',
    (_, collection) => {
      expect(collection.admin?.group).toBe(false)
      expect(collection.admin?.hidden).not.toBe(true)
      expect(collection.access).toBeDefined()
    },
  )
})

describe('content task routes mirror create and edit access', () => {
  const contentVisible = new Set([
    'activities',
    'announcements',
    'association-pages',
    'news',
    'media-assets',
  ])

  it('sends create-only capability directly to create routes', () => {
    const result = buildAdminExperience(
      actor('member', [
        {
          effect: 'allow',
          permission: 'content.create',
          scope: { type: 'global' },
        },
      ]),
      now,
      contentVisible,
    )
    const content = result.groups.find((group) => group.id === 'content')
    expect(content?.tasks.map((entry) => entry.href)).toEqual([
      '/admin/collections/association-pages/create',
      '/admin/collections/announcements/create',
      '/admin/collections/activities/create',
      '/admin/collections/news/create',
      '/admin/media-assets',
    ])
  })

  it('keeps edit-only users on the readable media list', () => {
    const result = buildAdminExperience(
      actor('member', [
        {
          effect: 'allow',
          permission: 'content.edit',
          scope: { type: 'global' },
        },
        {
          effect: 'deny',
          permission: 'content.create',
          scope: { type: 'global' },
        },
      ]),
      now,
      new Set(['media-assets']),
    )
    expect(
      result.groups.find((group) => group.id === 'content')?.tasks,
    ).toEqual([
      expect.objectContaining({
        href: '/admin/collections/media-assets',
        id: 'media-assets',
      }),
    ])
  })

  it('uses list routes only when content.edit is effective', () => {
    const result = buildAdminExperience(
      actor('member', [
        {
          effect: 'allow',
          permission: 'content.edit',
          scope: { type: 'global' },
        },
      ]),
      now,
      contentVisible,
    )
    const content = result.groups.find((group) => group.id === 'content')
    expect(
      content?.tasks.every((entry) => !entry.href.endsWith('/create')),
    ).toBe(true)
  })
})

describe('R3 Admin shell, content guidance, and permission copy', () => {
  it('lets Payload own the only DefaultTemplate for every custom business view', () => {
    for (const path of [
      'src/modules/admin-experience/AdminDashboardView.tsx',
      'src/modules/identity-access/admin/AccountManagementView.tsx',
      'src/modules/recruitment/admin/ReviewQueueView.tsx',
      'src/modules/recruitment/member-account-claim/admin/MemberAccountView.tsx',
      'src/modules/recruitment/member-account-claim/admin/MemberClaimAdminView.tsx',
    ]) {
      expect(readFileSync(resolve(process.cwd(), path), 'utf8')).not.toContain(
        'DefaultTemplate',
      )
    }
  })

  it.each([AssociationPages, Announcements, Activities, News])(
    'uses a non-selectable list with visible edit guidance and public field semantics',
    (collection) => {
      const contentListView = readFileSync(
        resolve(
          process.cwd(),
          'src/modules/admin-experience/ContentListView.tsx',
        ),
        'utf8',
      )
      expect(collection.admin?.components?.views?.list?.Component).toContain(
        'ContentListView',
      )
      expect(contentListView).toContain('enableRowSelections={false}')
      expect(contentListView).toContain('DefaultListView')
      expect(contentListView).not.toMatch(/select-all|select-row/)
      expect(contentListView).not.toContain('content-list-view.module.css')
      expect(collection.admin?.components?.beforeList).toEqual([
        expect.stringContaining('ContentListGuidance'),
      ])
      expect(collection.admin?.description).toContain('保存草稿')
      const title = collection.fields.find(
        (field) => 'name' in field && field.name === 'title',
      )
      const body = collection.fields.find(
        (field) => 'name' in field && field.name === 'body',
      )
      expect(JSON.stringify(title)).toContain('description')
      expect(JSON.stringify(body)).toContain('description')
    },
  )

  it('keeps every stable Permission ID and supplies Chinese operational guidance', () => {
    const accountClient = readFileSync(
      resolve(
        process.cwd(),
        'src/modules/identity-access/admin/AccountManagementClient.tsx',
      ),
      'utf8',
    )
    const preconfigurePanel = readFileSync(
      resolve(
        process.cwd(),
        'src/modules/recruitment/member-account-claim/admin/PreconfigurePanel.tsx',
      ),
      'utf8',
    )
    expect(Object.keys(permissionCopy).sort()).toEqual([...permissions].sort())
    expect(permissionCopy['accounts.manage'].label).toContain('高风险')
    expect(permissionCopy['recruitment.application.read'].usage).toContain(
      '指定招新届次',
    )
    expect(accountClient).toContain('<label htmlFor="override-permission">')
    expect(accountClient).toContain(
      'aria-describedby={`override-permission-help',
    )
    expect(preconfigurePanel).toContain(
      'aria-describedby={`preconfigure-permission-help-${index}`}',
    )
    expect(preconfigurePanel).toContain(
      '<small id={`preconfigure-permission-help-${index}`}>',
    )
  })
})
