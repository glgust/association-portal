import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { AdminPageContext } from '@/modules/admin-experience/AdminPageContext'
import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'

import { MediaAssetUploadClient } from './MediaAssetUploadClient'

export async function MediaAssetUploadView(props: AdminViewServerProps) {
  const req = props.initPageResult.req
  const actor = await loadActor(req.payload, req)
  const allowed =
    actor &&
    authorize(actor, 'content.create', { type: 'global' }, new Date()).allowed
  return (
    <>
      <AdminPageContext group="内容管理" title="上传媒体资产" />
      {allowed ? (
        <MediaAssetUploadClient />
      ) : (
        <main>
          <h1>上传媒体资产</h1>
          <p role="alert">你没有上传媒体资产的权限。</p>
          <Link href="/admin">返回工作台</Link>
        </main>
      )}
    </>
  )
}
