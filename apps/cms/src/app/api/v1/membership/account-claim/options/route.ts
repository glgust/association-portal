import {
  membershipAccountClaimOptionsSchema,
  type MembershipIdentity,
} from '@ascnucc/contracts'
import { NextResponse } from 'next/server'

import {
  roleDefaultPermissions,
  type AccountRole,
  type Permission,
} from '@/modules/authorization/authorize'
import { requestIdFrom } from '@/modules/http/request'

import { noStoreHeaders } from '../../_shared'

const permissionLabels: Record<Permission, string> = {
  'accounts.manage': '管理授权范围内的账号',
  'audit.read': '读取审计记录',
  'content.create': '创建内容',
  'content.directPublish': '直接发布内容',
  'content.edit': '编辑内容',
  'recruitment.application.read': '读取入会申请',
  'recruitment.application.review': '审核入会申请',
  'recruitment.form.manage': '管理入会表单',
}

const optionDetails: Record<
  MembershipIdentity,
  { defaultRole: AccountRole; description: string; label: string }
> = {
  cadre: {
    defaultRole: 'cadre',
    description: '协会部门干部; 权限仍以后台预配置为准。',
    label: '部门干部',
  },
  member: {
    defaultRole: 'member',
    description: '非校内登记的正式成员; 默认没有后台业务权限。',
    label: '会员',
  },
  staff: {
    defaultRole: 'staff',
    description: '协会普通干事; 权限仍以后台预配置为准。',
    label: '普通干事',
  },
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers)
  const identities = ['member', 'staff', 'cadre'] as const
  const result = membershipAccountClaimOptionsSchema.parse({
    options: identities.map((membershipIdentity) => {
      const details = optionDetails[membershipIdentity]
      return {
        ...details,
        defaultPermissionSummary: roleDefaultPermissions(
          details.defaultRole,
        ).map((permission) => permissionLabels[permission]),
        membershipIdentity,
      }
    }),
    requestId,
  })
  return NextResponse.json(result, {
    headers: noStoreHeaders(requestId),
  })
}
