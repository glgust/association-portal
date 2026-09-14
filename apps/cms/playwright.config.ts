import { defineConfig } from '@playwright/test'
import { assertE2EMediaStorageConfig } from './src/config/media-storage-e2e'
import { readMediaStorageConfig } from './src/config/media-storage'

const databaseUrl = process.env.DATABASE_URL
const payloadSecret = process.env.PAYLOAD_SECRET
const mediaStorage = assertE2EMediaStorageConfig(readMediaStorageConfig())
const mediaEnvironment: Record<string, string> =
  mediaStorage.mode === 'local'
    ? {
        MEDIA_LOCAL_ROOT: mediaStorage.root,
        MEDIA_STORAGE_MODE: 'local',
      }
    : {
        MEDIA_S3_ACCESS_KEY_ID: mediaStorage.accessKeyId,
        MEDIA_S3_BUCKET: mediaStorage.bucket,
        MEDIA_S3_ENDPOINT: mediaStorage.endpoint,
        MEDIA_S3_FORCE_PATH_STYLE: String(mediaStorage.forcePathStyle),
        MEDIA_S3_REGION: mediaStorage.region,
        MEDIA_S3_SECRET_ACCESS_KEY: mediaStorage.secretAccessKey,
        MEDIA_STORAGE_MODE: 's3',
      }

if (process.env.PLAYWRIGHT_MANAGED_SERVERS !== undefined) {
  throw new Error(
    'PLAYWRIGHT_MANAGED_SERVERS is not supported; E2E must start its managed CMS',
  )
}

function parseLocalHttpOrigin(name: string, value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid local HTTP origin`)
  }

  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    value !== url.origin
  ) {
    throw new Error(`${name} must be a local HTTP origin without a path`)
  }

  return url
}

let parsedDatabaseUrl: URL | undefined
try {
  parsedDatabaseUrl = databaseUrl ? new URL(databaseUrl) : undefined
} catch {
  parsedDatabaseUrl = undefined
}

if (
  !databaseUrl ||
  !parsedDatabaseUrl ||
  !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
  !['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname) ||
  parsedDatabaseUrl.pathname !== '/ascnucc_demo_test' ||
  !payloadSecret
) {
  throw new Error(
    'Playwright requires local ascnucc_demo_test and PAYLOAD_SECRET',
  )
}

const cmsServerUrl = parseLocalHttpOrigin(
  'PLAYWRIGHT_CMS_SERVER_URL',
  process.env.PLAYWRIGHT_CMS_SERVER_URL ?? 'http://127.0.0.1:3201',
)
const cmsServerPort = Number(cmsServerUrl.port)
if (!Number.isSafeInteger(cmsServerPort) || cmsServerPort < 1) {
  throw new Error(
    'PLAYWRIGHT_CMS_SERVER_URL must include an explicit valid port',
  )
}
const cmsControlPort = cmsServerPort + 10_000
const webControlPort = 13_100
if (cmsControlPort > 65_535 || cmsControlPort === webControlPort) {
  throw new Error('PLAYWRIGHT_CMS_SERVER_URL cannot derive a control port')
}
process.env.ASCNUCC_PLAYWRIGHT_CONTROL_PORTS = `${cmsControlPort},${webControlPort}`
const publicCmsUrl = parseLocalHttpOrigin(
  'PLAYWRIGHT_CMS_API_URL',
  process.env.PLAYWRIGHT_CMS_API_URL ?? cmsServerUrl.origin,
).origin

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  globalTeardown: './scripts/playwright-global-teardown.ts',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? './test-results',
  reporter: 'list',
  retries: 0,
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    channel: process.env.PLAYWRIGHT_CHANNEL as 'msedge' | undefined,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node scripts/playwright-next-server.mjs --dir . --hostname 127.0.0.1 --port ${cmsServerPort} --control-port ${cmsControlPort}`,
      env: {
        DATABASE_URL: databaseUrl,
        ...mediaEnvironment,
        NEXT_TELEMETRY_DISABLED: '1',
        PAYLOAD_SECRET: payloadSecret,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${cmsServerUrl.origin}/admin`,
    },
    {
      command: `node scripts/playwright-next-server.mjs --dir ../web --hostname 127.0.0.1 --port 3100 --control-port ${webControlPort}`,
      env: {
        CMS_API_URL: publicCmsUrl,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:3100',
    },
  ],
  workers: 1,
})
