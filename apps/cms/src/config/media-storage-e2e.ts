import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

import type { MediaStorageConfig } from './media-storage'

export const E2E_LOCAL_MEDIA_ROOT = resolve(tmpdir(), 'ascnucc-media-e2e')

export function assertE2EMediaStorageConfig(
  config: MediaStorageConfig,
): MediaStorageConfig {
  if (config.mode === 'local') {
    if (resolve(config.root) !== E2E_LOCAL_MEDIA_ROOT) {
      throw new Error(`E2E local media root must be ${E2E_LOCAL_MEDIA_ROOT}`)
    }
    return config
  }
  const endpoint = new URL(config.endpoint)
  if (
    endpoint.origin !== 'http://127.0.0.1:19000' ||
    endpoint.pathname !== '/' ||
    config.bucket !== 'ascnucc-media-integration' ||
    config.accessKeyId !== 'ascnucc-media-integration' ||
    config.secretAccessKey !== 'local-integration-secret-not-for-production' ||
    config.region !== 'us-east-1' ||
    config.forcePathStyle !== true
  ) {
    throw new Error(
      'E2E S3 media storage must use the dedicated loopback MinIO integration configuration',
    )
  }
  return config
}
