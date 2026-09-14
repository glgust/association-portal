import type { MediaStorageConfig } from '@/config/environment'

import { LocalObjectStorage } from './local-storage'
import type { ObjectStoragePort } from './object-storage'
import { S3ObjectStorage } from './s3-storage'

export type { ObjectStoragePort, StoredObject } from './object-storage'

export function createObjectStorage(
  config: MediaStorageConfig,
): ObjectStoragePort {
  return config.mode === 'local'
    ? new LocalObjectStorage(config.root)
    : new S3ObjectStorage(config)
}
