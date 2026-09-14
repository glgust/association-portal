import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import {
  assertPrivateObjectKey,
  type ObjectStoragePort,
} from './object-storage'

type S3StorageOptions = {
  accessKeyId: string
  bucket: string
  endpoint: string
  forcePathStyle: boolean
  region: string
  secretAccessKey: string
}

export class S3ObjectStorage implements ObjectStoragePort {
  private readonly bucket: string
  private readonly client: S3Client

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket
    this.client = new S3Client({
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      region: options.region,
    })
  }

  async put(input: {
    body: Uint8Array
    contentType: string
    key: string
  }): Promise<void> {
    assertPrivateObjectKey(input.key)
    await this.client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: this.bucket,
        ContentType: input.contentType,
        Key: input.key,
      }),
    )
  }

  async get(key: string) {
    assertPrivateObjectKey(key)
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      if (!result.Body) throw new Error('Object response body is missing')
      const body = await result.Body.transformToByteArray()
      return {
        body,
        byteSize: result.ContentLength ?? body.byteLength,
        contentType: result.ContentType ?? 'application/octet-stream',
        etag: result.ETag ?? '"unavailable"',
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        (error.name === 'NoSuchKey' || error.name === 'NotFound')
      ) {
        return null
      }
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    assertPrivateObjectKey(key)
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return
    keys.forEach(assertPrivateObjectKey)
    const result = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    )
    if (result.Errors?.length) {
      throw new Error('One or more private media objects could not be deleted')
    }
  }
}
