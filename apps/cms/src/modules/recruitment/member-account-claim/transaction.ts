import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
  type Payload,
} from 'payload'

import {
  accountLockResource,
  withAdvisoryResourceLocks,
} from '@/modules/identity-access/transaction'

export async function inMemberAccountClaimTransaction<T>(
  req: PayloadRequest,
  operation: () => Promise<T>,
): Promise<T> {
  const ownsTransaction = await initTransaction(req)
  try {
    const result = await operation()
    if (ownsTransaction) await commitTransaction(req)
    return result
  } catch (error) {
    if (ownsTransaction) await killTransaction(req)
    throw error
  }
}

export async function withMemberClaimLocks<T>(
  payload: Payload,
  resources: {
    accountIds?: readonly string[]
    claimIds?: readonly string[]
    idempotencyKeys?: readonly string[]
    intakeIds?: readonly string[]
    memberIds?: readonly string[]
    memberStudentNumbers?: readonly string[]
  },
  operation: () => Promise<T>,
): Promise<T> {
  return withAdvisoryResourceLocks(
    payload,
    [
      ...(resources.accountIds ?? []).map(accountLockResource),
      ...(resources.claimIds ?? []).map(
        (id) => `membership-account-claim:claim:${id}`,
      ),
      ...(resources.idempotencyKeys ?? []).map(
        (key) => `membership-account-claim:idempotency:${key}`,
      ),
      ...(resources.intakeIds ?? []).map(
        (id) => `membership-account-claim:intake:${id}`,
      ),
      ...(resources.memberIds ?? []).map(
        (id) => `membership-account-claim:member:${id}`,
      ),
      ...(resources.memberStudentNumbers ?? []).map(
        (studentNumber) =>
          `membership-account-claim:member-student-number:${createHash('sha256').update(studentNumber).digest('hex')}`,
      ),
    ],
    operation,
  )
}
import { createHash } from 'node:crypto'
