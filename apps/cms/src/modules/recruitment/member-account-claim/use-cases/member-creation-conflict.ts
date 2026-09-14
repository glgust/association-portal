import { ValidationError } from 'payload'

const memberConstraints = new Set([
  'members_auth_user_idx',
  'members_student_number_idx',
])

const accountConstraints = new Set([
  'auth_users_student_number_idx',
  'auth_users_username_idx',
])

export function isKnownMemberCreationConflict(
  error: unknown,
  options: { includeAccount: boolean },
): boolean {
  const payloadPaths = new Set([
    'studentNumber',
    ...(options.includeAccount ? ['authUser', 'username'] : []),
  ])
  if (
    error instanceof ValidationError &&
    error.data.errors.some((entry) => payloadPaths.has(entry.path))
  ) {
    return true
  }

  let current: unknown = error
  for (
    let depth = 0;
    depth < 8 && current && typeof current === 'object';
    depth += 1
  ) {
    const candidate = current as { code?: unknown; constraint?: unknown }
    if (
      candidate.code === '23505' &&
      typeof candidate.constraint === 'string'
    ) {
      return (
        memberConstraints.has(candidate.constraint) ||
        (options.includeAccount && accountConstraints.has(candidate.constraint))
      )
    }
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}
