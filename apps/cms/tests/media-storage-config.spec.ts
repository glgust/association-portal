import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readMediaStorageConfig } from '@/config/media-storage'

describe('media storage environment', () => {
  it('accepts explicit local configuration and rejects mixed settings', () => {
    const localRoot = resolve('tmp/ascnucc-media-test')

    expect(
      readMediaStorageConfig({
        MEDIA_LOCAL_ROOT: localRoot,
        MEDIA_STORAGE_MODE: 'local',
      }),
    ).toEqual({ mode: 'local', root: localRoot })
    expect(() =>
      readMediaStorageConfig({
        MEDIA_LOCAL_ROOT: localRoot,
        MEDIA_S3_BUCKET: 'must-not-mix',
        MEDIA_STORAGE_MODE: 'local',
      }),
    ).toThrow(/S3 variables/)
    expect(() =>
      readMediaStorageConfig({
        MEDIA_LOCAL_ROOT: 'relative/media',
        MEDIA_STORAGE_MODE: 'local',
      }),
    ).toThrow('MEDIA_LOCAL_ROOT must be an absolute path')
  })

  it('requires a complete S3 configuration without echoing values', () => {
    expect(() => readMediaStorageConfig({ MEDIA_STORAGE_MODE: 's3' })).toThrow(
      'MEDIA_S3_ENDPOINT',
    )
    expect(() => readMediaStorageConfig({})).toThrow(
      'MEDIA_STORAGE_MODE must be local or s3',
    )
  })

  it('validates the complete S3 endpoint structure during configuration initialization', () => {
    const complete = {
      MEDIA_S3_ACCESS_KEY_ID: 'fictional-access',
      MEDIA_S3_BUCKET: 'ascnucc-media-integration',
      MEDIA_S3_ENDPOINT: 'http://127.0.0.1:19000',
      MEDIA_S3_FORCE_PATH_STYLE: 'true',
      MEDIA_S3_REGION: 'us-east-1',
      MEDIA_S3_SECRET_ACCESS_KEY: 'fictional-secret',
      MEDIA_STORAGE_MODE: 's3',
    }
    expect(readMediaStorageConfig(complete)).toMatchObject({
      endpoint: 'http://127.0.0.1:19000/',
      mode: 's3',
    })
    expect(() =>
      readMediaStorageConfig({
        ...complete,
        MEDIA_S3_ENDPOINT: 'not-a-url',
      }),
    ).toThrow('MEDIA_S3_ENDPOINT must be an absolute HTTP(S) URL')
    expect(() =>
      readMediaStorageConfig({
        ...complete,
        MEDIA_S3_ENDPOINT: 'ftp://fictional.example.test',
      }),
    ).toThrow(/HTTP\(S\)/)
    expect(() =>
      readMediaStorageConfig({
        ...complete,
        MEDIA_S3_ENDPOINT: 'https://user:secret@fictional.example.test',
      }),
    ).toThrow(/without embedded credentials/)
  })

  it('fails while importing Payload config instead of waiting for the first request', () => {
    const cleanEnvironment = { ...process.env }
    for (const name of [
      'MEDIA_LOCAL_ROOT',
      'MEDIA_S3_ACCESS_KEY_ID',
      'MEDIA_S3_BUCKET',
      'MEDIA_S3_ENDPOINT',
      'MEDIA_S3_FORCE_PATH_STYLE',
      'MEDIA_S3_REGION',
      'MEDIA_S3_SECRET_ACCESS_KEY',
      'MEDIA_STORAGE_MODE',
    ]) {
      delete cleanEnvironment[name]
    }
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '-e', "import('./src/config/environment.ts')"],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...cleanEnvironment,
          DATABASE_URL: 'postgres://fictional:fictional@127.0.0.1:5432/none',
          PAYLOAD_SECRET: 'fictional-startup-secret-32-characters',
        },
        timeout: 20_000,
      },
    )
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain(
      'MEDIA_STORAGE_MODE must be local or s3',
    )
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      'fictional-startup-secret',
    )
    expect(readFileSync(resolve('src/payload.config.ts'), 'utf8')).toContain(
      "import { environment } from '@/config/environment'",
    )
  })
})
