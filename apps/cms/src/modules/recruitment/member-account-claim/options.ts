import type { MembershipIdentity } from './domain'

const identityCopy: Record<
  MembershipIdentity,
  { description: string; label: string; role: MembershipIdentity }
> = {
  member: {
    description: '非校内登记的正式成员',
    label: '会员',
    role: 'member',
  },
  staff: {
    description: '协会普通干事',
    label: '普通干事',
    role: 'staff',
  },
  cadre: {
    description: '协会部门干部',
    label: '部门干部',
    role: 'cadre',
  },
}

export function accountClaimOptions(
  summarizeRoleDefaults: (role: MembershipIdentity) => readonly string[],
) {
  return (['member', 'staff', 'cadre'] as const).map((identity) => ({
    defaultPermissions: [...summarizeRoleDefaults(identity)],
    description: identityCopy[identity].description,
    id: identity,
    label: identityCopy[identity].label,
    role: identityCopy[identity].role,
  }))
}
