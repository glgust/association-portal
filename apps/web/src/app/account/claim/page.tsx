import type { Metadata } from 'next'

import { AccountClaimClient } from './AccountClaimClient'
import styles from './account-claim.module.css'

export const metadata: Metadata = {
  description: '供已完成线下流程的协会成员核验身份并申领账号。',
  title: '会员身份核验与账号申领',
}

export default function AccountClaimPage() {
  return (
    <main className={styles.page} id="main-content">
      <header className={styles.heading}>
        <p className={styles.eyebrow}>PORTAL · 会员服务</p>
        <h1>会员身份核验与账号申领</h1>
        <p>
          本页面仅辅助已经完成线下面试或协会核验流程的正式成员申领账号，不是公开招新报名入口。
        </p>
      </header>
      <p>
        已经提交？<a href="/account/claim/status">使用查询凭证查看认领进度</a>
      </p>
      <AccountClaimClient />
    </main>
  )
}
