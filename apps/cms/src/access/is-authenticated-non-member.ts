import type { Access } from 'payload'

export function isAuthenticatedNonMemberRequest(req: {
  user?: null | { role?: null | string }
}): boolean {
  return Boolean(req.user && req.user.role !== 'member')
}

export const isAuthenticatedNonMember: Access = ({ req }) =>
  isAuthenticatedNonMemberRequest(req)
