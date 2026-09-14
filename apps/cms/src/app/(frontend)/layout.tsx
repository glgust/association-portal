import type { ReactNode } from 'react'

export const metadata = {
  description: 'Payload 与业务后台边界验证',
  title: '天文协会 CMS Demo',
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
