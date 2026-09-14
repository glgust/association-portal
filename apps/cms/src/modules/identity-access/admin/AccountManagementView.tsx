import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import { AdminPageContext } from '@/modules/admin-experience/AdminPageContext'

import { AccountManagementClient } from './AccountManagementClient'

export async function AccountManagementView(props: AdminViewServerProps) {
  const req = props.initPageResult.req
  const actor = await loadActor(req.payload, req)
  const allowed =
    actor &&
    authorize(actor, 'accounts.manage', { type: 'global' }, new Date()).allowed

  return (
    <>
      <AdminPageContext group="会员与账号" title="账号创建与管理" />
      {allowed ? (
        <AccountManagementClient />
      ) : (
        <main>
          <h1>账号创建与管理</h1>
          <p role="alert">你没有访问此管理页面的权限。</p>
          <p>
            <Link href="/admin">返回工作台</Link>
          </p>
        </main>
      )}
    </>
  )
}
