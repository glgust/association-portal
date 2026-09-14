import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from 'payload'

export async function inRequestTransaction<T>(
  req: PayloadRequest,
  operation: () => Promise<T>,
): Promise<T> {
  await initTransaction(req)
  try {
    const result = await operation()
    await commitTransaction(req)
    return result
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}
