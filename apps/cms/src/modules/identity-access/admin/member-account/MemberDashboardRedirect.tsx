import { redirect } from 'next/navigation'
import type { ServerProps } from 'payload'

export function MemberDashboardRedirect({ user }: ServerProps) {
  if (
    user?.collection === 'auth-users' &&
    user.role === 'member' &&
    user.status === 'active'
  ) {
    redirect('/admin/member-account')
  }

  return null
}
