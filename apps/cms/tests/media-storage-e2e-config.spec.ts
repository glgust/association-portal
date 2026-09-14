import { describe, expect, it } from 'vitest'

import {
  assertE2EMediaStorageConfig,
  E2E_LOCAL_MEDIA_ROOT,
} from '@/config/media-storage-e2e'

describe('E2E media storage safety gate', () => {
  it('only accepts the dedicated temporary local root', () => {
    expect(
      assertE2EMediaStorageConfig({
        mode: 'local',
        root: E2E_LOCAL_MEDIA_ROOT,
      }),
    ).toMatchObject({ mode: 'local' })
    expect(() =>
      assertE2EMediaStorageConfig({ mode: 'local', root: 'media' }),
    ).toThrow(/E2E local media root/)
  })

  it('rejects any S3 endpoint, bucket, or credential outside integration', () => {
    const integration = {
      accessKeyId: 'ascnucc-media-integration',
      bucket: 'ascnucc-media-integration',
      endpoint: 'http://127.0.0.1:19000',
      forcePathStyle: true,
      mode: 's3' as const,
      region: 'us-east-1',
      secretAccessKey: 'local-integration-secret-not-for-production',
    }
    expect(assertE2EMediaStorageConfig(integration)).toEqual(integration)
    expect(() =>
      assertE2EMediaStorageConfig({
        ...integration,
        endpoint: 'https://objects.example.invalid',
      }),
    ).toThrow(/dedicated loopback MinIO/)
    expect(() =>
      assertE2EMediaStorageConfig({ ...integration, bucket: 'production' }),
    ).toThrow(/dedicated loopback MinIO/)
  })
})
