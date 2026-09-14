'use client'

import { Logout } from '@payloadcms/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import type { AdminTaskGroup } from './capabilities'
import styles from './admin-experience.module.css'

export function AdminTaskNavClient({
  groups,
  roleLabel,
}: {
  groups: AdminTaskGroup[]
  roleLabel: string
}) {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(true)
  const current = (href: string) =>
    pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`))

  return (
    <nav aria-label="后台任务导航" className={styles.nav}>
      <div className={styles.navHeading}>
        <strong>协会管理后台</strong>
        <span>{roleLabel}</span>
      </div>
      <button
        aria-controls="admin-task-nav-links"
        aria-expanded={expanded}
        className={styles.navToggle}
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? '收起导航' : '展开导航'}
      </button>
      <div hidden={!expanded} id="admin-task-nav-links">
        <Link
          aria-current={current('/admin') ? 'page' : undefined}
          href="/admin"
        >
          工作台
        </Link>
        {groups.map((group) => (
          <details key={group.id} open>
            <summary>{group.label}</summary>
            <ul>
              {group.tasks.map((item) => (
                <li key={item.id}>
                  <Link
                    aria-current={current(item.href) ? 'page' : undefined}
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
        <div className={styles.navControls}>
          <Link
            aria-current={current('/admin/account') ? 'page' : undefined}
            href="/admin/account"
          >
            当前账号
          </Link>
          <Logout />
        </div>
      </div>
    </nav>
  )
}
