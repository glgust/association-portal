export type StoredObject = {
  body: Uint8Array
  byteSize: number
  contentType: string
  etag: string
}

export interface ObjectStoragePort {
  delete(key: string): Promise<void>
  deleteMany(keys: readonly string[]): Promise<void>
  get(key: string): Promise<StoredObject | null>
  put(input: {
    body: Uint8Array
    contentType: string
    key: string
  }): Promise<void>
}

export function assertPrivateObjectKey(key: string): void {
  if (
    !/^media\/[0-9a-f-]{36}\/(display|detail|list|thumbnail)\.webp$/.test(key)
  ) {
    throw new Error('Invalid private media object key')
  }
}
