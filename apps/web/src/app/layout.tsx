import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { siteIdentity } from '@/site'

import { SiteFrame } from '@/components/SiteFrame'

import './globals.css'
import './site-frame.css'
import './announcements/announcements.css'
import './association-pages.css'
import './activities/activities.css'
import './news/news.css'
import './gallery/gallery.css'

export const metadata: Metadata = {
  description: siteIdentity.description,
  title: {
    default: siteIdentity.name,
    template: `%s | ${siteIdentity.name}`,
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <SiteFrame>{children}</SiteFrame>
      </body>
    </html>
  )
}
