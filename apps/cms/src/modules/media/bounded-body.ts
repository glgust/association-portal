import { BusinessError } from '@/modules/shared/business-error'

import { MAX_UPLOAD_BYTES } from './image-processing'

export async function readBoundedMediaBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<Uint8Array> {
  if (!body) {
    throw new BusinessError('VALIDATION_FAILED', 'An image is required', 400)
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_UPLOAD_BYTES) {
        await reader.cancel()
        throw new BusinessError(
          'VALIDATION_FAILED',
          'Image exceeds the 10 MiB upload limit',
          413,
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (byteLength === 0) {
    throw new BusinessError('VALIDATION_FAILED', 'An image is required', 400)
  }
  return Buffer.concat(chunks, byteLength)
}
