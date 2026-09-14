'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { siteIdentity } from '@/site'

const navigationGroups = [
  {
    label: '内容',
    navigationLabel: '内容栏目',
    items: [
      { href: '/announcements', label: '公告' },
      { href: '/activities', label: '活动' },
      { href: '/news', label: '新闻' },
      { href: '/gallery', label: '画廊' },
    ],
  },
  {
    label: '协会',
    navigationLabel: '协会页面',
    items: [
      { href: '/about', label: '关于' },
      { href: '/contact', label: '联系' },
    ],
  },
] as const

export function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/') return children

  return (
    <>
      <aside className="site-sidebar" aria-label="站点导航">
        <Link className="site-sidebar-brand" href="/">
          <span>
            {siteIdentity.shortName}
            <em>{siteIdentity.name}</em>
          </span>
        </Link>

        {navigationGroups.map((group) => (
          <div className="site-sidebar-group" key={group.label}>
            <p>{group.label}</p>
            <nav aria-label={group.navigationLabel}>
              {group.items.map((item) => {
                const current =
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    aria-current={current ? 'page' : undefined}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        ))}

        <div className="site-sidebar-bottom">
          <a href="#site-top">↑ 回到顶部</a>
        </div>
      </aside>
      <div className="site-frame-content" id="site-top">
        {children}
      </div>
    </>
  )
}
