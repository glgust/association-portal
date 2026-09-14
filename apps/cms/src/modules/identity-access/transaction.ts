import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

export async function inIdentityTransaction<T>(
  req: PayloadRequest,
  operation: () => Promise<T>,
): Promise<T> {
  const shouldCommit = await initTransaction(req)
  try {
    const result = await operation()
    if (shouldCommit) await commitTransaction(req)
    return result
  } catch (error) {
    if (shouldCommit) await killTransaction(req)
    throw error
  }
}

export async function withAccountLock<T>(
  payload: Payload,
  accountId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withAdvisoryResourceLocks(
    payload,
    [accountLockResource(accountId)],
    operation,
  )
}

export function accountLockResource(accountId: string): string {
  return `identity-account:${accountId}`
}

export async function withAdvisoryResourceLocks<T>(
  payload: Payload,
  resources: readonly string[],
  operation: () => Promise<T>,
): Promise<T> {
  const lockIds = [...new Set(resources)].sort()
  const client = await payload.db.pool.connect()
  try {
    for (const lockId of lockIds) {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockId])
    }
    return await operation()
  } finally {
    try {
      for (const lockId of [...lockIds].reverse()) {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockId])
      }
    } finally {
      client.release()
    }
  }
}
