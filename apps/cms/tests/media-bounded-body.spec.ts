import { describe, expect, it, vi } from 'vitest'

import { readBoundedMediaBody } from '@/modules/media/bounded-body'
import { MAX_UPLOAD_BYTES } from '@/modules/media/image-processing'

describe('bounded media request body', () => {
  it('reads a chunked body without requiring Content-Length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3]))
        controller.close()
      },
    })
    await expect(
      readBoundedMediaBody(stream).then((body) => [...body]),
    ).resolves.toEqual([1, 2, 3])
  })

  it('cancels a chunked body as soon as it crosses 10 MiB', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_UPLOAD_BYTES))
        controller.enqueue(new Uint8Array([1]))
      },
    })
    await expect(readBoundedMediaBody(stream)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 413,
    })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
