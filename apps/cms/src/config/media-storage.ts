const s3EnvironmentNames = [
  'MEDIA_S3_ENDPOINT',
  'MEDIA_S3_REGION',
  'MEDIA_S3_BUCKET',
  'MEDIA_S3_ACCESS_KEY_ID',
  'MEDIA_S3_SECRET_ACCESS_KEY',
  'MEDIA_S3_FORCE_PATH_STYLE',
] as const

export type MediaStorageConfig =
  | { mode: 'local'; root: string }
  | {
      accessKeyId: string
      bucket: string
      endpoint: string
      forcePathStyle: boolean
      mode: 's3'
      region: string
      secretAccessKey: string
    }

export function readMediaStorageConfig(
  source: Record<string, string | undefined> = process.env,
): MediaStorageConfig {
  const mode = source.MEDIA_STORAGE_MODE?.trim()
  if (mode === 'local') {
    if (s3EnvironmentNames.some((name) => source[name]?.trim())) {
      throw new Error(
        'S3 variables are not allowed in MEDIA_STORAGE_MODE=local',
      )
    }
    const root = source.MEDIA_LOCAL_ROOT?.trim()
    if (!root)
      throw new Error('Missing required environment variable: MEDIA_LOCAL_ROOT')
    if (!path.isAbsolute(root)) {
      throw new Error('MEDIA_LOCAL_ROOT must be an absolute path')
    }
    return { mode, root }
  }
  if (mode === 's3') {
    if (source.MEDIA_LOCAL_ROOT?.trim()) {
      throw new Error(
        'MEDIA_LOCAL_ROOT is not allowed in MEDIA_STORAGE_MODE=s3',
      )
    }
    const values = Object.fromEntries(
      s3EnvironmentNames.map((name) => {
        const value = source[name]?.trim()
        if (!value)
          throw new Error(`Missing required environment variable: ${name}`)
        return [name, value]
      }),
    ) as Record<(typeof s3EnvironmentNames)[number], string>
    if (!['true', 'false'].includes(values.MEDIA_S3_FORCE_PATH_STYLE)) {
      throw new Error('MEDIA_S3_FORCE_PATH_STYLE must be true or false')
    }
    let endpoint: URL
    try {
      endpoint = new URL(values.MEDIA_S3_ENDPOINT)
    } catch {
      throw new Error('MEDIA_S3_ENDPOINT must be an absolute HTTP(S) URL')
    }
    if (
      !['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new Error(
        'MEDIA_S3_ENDPOINT must be an HTTP(S) URL without embedded credentials',
      )
    }
    return {
      accessKeyId: values.MEDIA_S3_ACCESS_KEY_ID,
      bucket: values.MEDIA_S3_BUCKET,
      endpoint: endpoint.toString(),
      forcePathStyle: values.MEDIA_S3_FORCE_PATH_STYLE === 'true',
      mode,
      region: values.MEDIA_S3_REGION,
      secretAccessKey: values.MEDIA_S3_SECRET_ACCESS_KEY,
    }
  }
  throw new Error('MEDIA_STORAGE_MODE must be local or s3')
}
import path from 'node:path'
