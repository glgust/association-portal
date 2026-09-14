import type { ComponentProps } from 'react'
import { DefaultNav } from '@payloadcms/next/rsc'

import { AdminTaskNav } from '@/modules/admin-experience/AdminTaskNav'

export async function IdentityAwareNav(
  props: ComponentProps<typeof DefaultNav>,
) {
  return <AdminTaskNav {...props} />
}
