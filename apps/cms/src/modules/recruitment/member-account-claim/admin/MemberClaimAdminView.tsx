import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'
import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import { permissions } from '@/modules/authorization/permissions'
import { AdminPageContext } from '@/modules/admin-experience/AdminPageContext'
import { MemberClaimAdminClient } from './MemberClaimAdminClient'
import { PreconfigurePanel } from './PreconfigurePanel'

export async function MemberClaimAdminView(props: AdminViewServerProps) {
  const req = props.initPageResult.req
  const actor = await loadActor(req.payload, req)
  const allowed =
    actor &&
    (actor.role === 'admin' || actor.role === 'owner') &&
    authorize(actor, 'accounts.manage', { type: 'global' }, new Date()).allowed

  return (
    <>
      <AdminPageContext group="会员与账号" title="会员账号认领与人工核验" />
      {allowed ? (
        <>
          <PreconfigurePanel permissionOptions={permissions} />
          <MemberClaimAdminClient />
        </>
      ) : (
        <main>
          <h1>会员账号核验</h1>
          <p role="alert">你没有访问此管理页面的权限。</p>
          <p>
            <Link href="/admin">返回工作台</Link>
          </p>
        </main>
      )}
    </>
  )
}
