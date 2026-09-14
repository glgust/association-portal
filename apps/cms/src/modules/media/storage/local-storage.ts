import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  assertPrivateObjectKey,
  type ObjectStoragePort,
} from './object-storage'

export class LocalObjectStorage implements ObjectStoragePort {
  constructor(private readonly root: string) {
    if (!path.isAbsolute(root)) {
      throw new Error('MEDIA_LOCAL_ROOT must be an absolute path')
    }
  }

  private resolve(key: string): string {
    assertPrivateObjectKey(key)
    return path.join(this.root, ...key.split('/'))
  }

  async put(input: {
    body: Uint8Array
    contentType: string
    key: string
  }): Promise<void> {
    const target = this.resolve(input.key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, input.body, { flag: 'wx' })
  }

  async get(key: string) {
    try {
      const body = await readFile(this.resolve(key))
      return {
        body,
        byteSize: body.byteLength,
        contentType: 'image/webp',
        etag: `"${createHash('sha256').update(body).digest('hex')}"`,
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null
      }
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    const results = await Promise.allSettled(
      keys.map((key) => this.delete(key)),
    )
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('One or more private media objects could not be deleted')
    }
  }
}
