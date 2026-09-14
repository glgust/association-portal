import type { AdminViewServerProps } from 'payload'

import { MemberAccountLanding } from '@/modules/identity-access/admin/member-account/MemberAccountLanding'
import { memberAccountLandingSchema } from '@/modules/identity-access/admin/member-account/schema'
import { loadActor } from '@/modules/authorization/load-actor'
import { AdminPageContext } from '@/modules/admin-experience/AdminPageContext'

import { memberAccountCapabilities } from './member-capabilities'

export async function MemberAccountView(props: AdminViewServerProps) {
  const user = props.initPageResult.req.user
  let summary = null
  if (
    user?.collection === 'auth-users' &&
    user.role === 'member' &&
    user.status === 'active'
  ) {
    const actor = await loadActor(
      props.initPageResult.req.payload,
      props.initPageResult.req,
    )
    const members = await props.initPageResult.req.payload.find({
      collection: 'members',
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req: props.initPageResult.req,
      where: { authUser: { equals: user.id } },
    })
    const member = members.docs[0]
    if (member?.membershipIdentity) {
      summary = memberAccountLandingSchema.parse({
        capabilities: actor ? memberAccountCapabilities(actor, new Date()) : [],
        displayName: user.displayName,
        membershipIdentity: member.membershipIdentity,
        status: 'active',
      })
    }
  }

  return (
    <>
      <AdminPageContext group="会员与账号" title="我的协会账号" />
      {summary ? (
        <MemberAccountLanding summary={summary} />
      ) : (
        <main>
          <h1>协会账号</h1>
          <p role="status">当前账号没有可显示的会员落地信息。</p>
        </main>
      )}
    </>
  )
}
