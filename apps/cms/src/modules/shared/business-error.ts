import type { ApiError } from '@ascnucc/contracts'

export class BusinessError extends Error {
  constructor(
    public readonly code: ApiError['code'],
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'BusinessError'
  }
}

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (
    let depth = 0;
    depth < 6 && current && typeof current === 'object';
    depth += 1
  ) {
    if ('code' in current && current.code === '23505') return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}
