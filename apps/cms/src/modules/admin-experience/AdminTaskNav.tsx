import type { ComponentProps } from 'react'
import { DefaultNav } from '@payloadcms/next/rsc'

import { loadActor } from '@/modules/authorization/load-actor'

import { buildAdminExperience } from './capabilities'
import { AdminTaskNavClient } from './AdminTaskNavClient'

export async function AdminTaskNav(props: ComponentProps<typeof DefaultNav>) {
  const req = props.req
  const actor = req ? await loadActor(req.payload, req) : null
  const model = buildAdminExperience(
    actor,
    new Date(),
    new Set(props.visibleEntities?.collections ?? []),
  )
  return (
    <AdminTaskNavClient groups={model.groups} roleLabel={model.roleLabel} />
  )
}
