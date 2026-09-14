import type { Metadata } from 'next'

import { ClaimStatusClient } from './ClaimStatusClient'
import styles from '../account-claim.module.css'

export const metadata: Metadata = {
  description: '使用一次性保存的查询凭证查看会员账号认领或人工核验进度。',
  title: '认领进度查询',
}

export default function ClaimStatusPage() {
  return (
    <main className={styles.page} id="main-content">
      <header className={styles.heading}>
        <p className={styles.eyebrow}>PORTAL · 会员服务</p>
        <h1>认领进度查询</h1>
        <p>
          此入口不需要登录。查询凭证只能读取粗粒度进度，不能登录、激活或修改申请。
        </p>
      </header>
      <ClaimStatusClient />
    </main>
  )
}
