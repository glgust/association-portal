import 'dotenv/config'

import { sql, type MigrateUpArgs } from '@payloadcms/db-postgres'
import { createHash, randomUUID } from 'node:crypto'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { assertE2EMediaStorageConfig } from '../src/config/media-storage-e2e'
import { environment } from '../src/config/environment'
import { createObjectStorage } from '../src/modules/media/storage'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_test' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error('Media R1 probe may only use local ascnucc_demo_test')
}

const storageConfig = assertE2EMediaStorageConfig(environment.mediaStorage)
if (storageConfig.mode !== 's3') {
  throw new Error('Media R1 integration probe requires dedicated local MinIO')
}

const payload = await getPayload({ config })
const db = payload.db.drizzle as MigrateUpArgs['db']
const variants = ['display', 'detail', 'list', 'thumbnail'] as const
const metadata = [
  'object_key',
  'sha256',
  'mime_type',
  'width',
  'height',
  'byte_size',
] as const
const requiredColumns = [
  'object_prefix',
  'sha256',
  'mime_type',
  'width',
  'height',
  'byte_size',
  ...variants.flatMap((variant) =>
    metadata.map((field) => `${variant}_${field}`),
  ),
  'created_by_id',
]
const { rows } = await db.execute(sql`
  SELECT "column_name", "is_nullable"
  FROM "information_schema"."columns"
  WHERE "table_schema" = 'public'
    AND "table_name" = 'media_assets'
`)
const columns = new Map(
  (rows as Array<{ column_name: string; is_nullable: string }>).map((row) => [
    row.column_name,
    row.is_nullable,
  ]),
)
if (
  requiredColumns.length !== 31 ||
  requiredColumns.some((column) => columns.get(column) !== 'NO')
) {
  throw new Error('M012 MediaAsset variant completeness probe failed')
}

const storage = createObjectStorage(storageConfig)
const assets = await payload.find({
  collection: 'media-assets',
  depth: 0,
  limit: 1,
  overrideAccess: true,
  pagination: false,
  sort: '-createdAt',
})
const asset = assets.docs[0] as unknown as
  | (Record<string, unknown> & {
      createdBy?: unknown
      detail?: Record<string, unknown>
      display?: Record<string, unknown>
      list?: Record<string, unknown>
      thumbnail?: Record<string, unknown>
    })
  | undefined
if (!asset) throw new Error('Media R2 semantic probe requires a real asset')

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

if (
  !isNonEmptyText(asset.objectPrefix) ||
  !isNonEmptyText(asset.sha256) ||
  asset.mimeType !== 'image/webp' ||
  !isPositive(asset.width) ||
  !isPositive(asset.height) ||
  !isPositive(asset.byteSize) ||
  !isNonEmptyText(asset.createdBy)
) {
  throw new Error('Media R2 main metadata semantic completeness failed')
}

const display = asset.display
if (
  !display ||
  asset.sha256 !== display.sha256 ||
  asset.mimeType !== display.mimeType ||
  asset.width !== display.width ||
  asset.height !== display.height ||
  asset.byteSize !== display.byteSize
) {
  throw new Error('Media R3 root metadata must exactly mirror display variant')
}

for (const variantName of variants) {
  const variant = asset[variantName]
  if (
    !variant ||
    !isNonEmptyText(variant.objectKey) ||
    !isNonEmptyText(variant.sha256) ||
    variant.mimeType !== 'image/webp' ||
    !isPositive(variant.width) ||
    !isPositive(variant.height) ||
    !isPositive(variant.byteSize) ||
    variant.objectKey !== `media/${asset.objectPrefix}/${variantName}.webp`
  ) {
    throw new Error(`Media R2 ${variantName} metadata completeness failed`)
  }
  const object = await storage.get(variant.objectKey)
  if (
    !object ||
    object.contentType !== variant.mimeType ||
    object.byteSize !== variant.byteSize ||
    object.body.byteLength !== variant.byteSize ||
    createHash('sha256').update(object.body).digest('hex') !== variant.sha256
  ) {
    throw new Error(`Media R2 ${variantName} object readability failed`)
  }
}

const prefix = randomUUID()
const displayKey = `media/${prefix}/display.webp`
const detailKey = `media/${prefix}/detail.webp`
const body = new TextEncoder().encode('fictional-private-webp-probe')
try {
  await storage.put({ body, contentType: 'image/webp', key: displayKey })
  const stored = await storage.get(displayKey)
  if (
    !stored ||
    stored.contentType !== 'image/webp' ||
    Buffer.compare(Buffer.from(stored.body), Buffer.from(body)) !== 0
  ) {
    throw new Error('MinIO put/get probe failed')
  }
  await storage.delete(displayKey)
  await storage.delete(displayKey)
  if (await storage.get(displayKey)) {
    throw new Error('MinIO repeated single delete was not idempotent')
  }

  await Promise.all(
    [displayKey, detailKey].map((key) =>
      storage.put({ body, contentType: 'image/webp', key }),
    ),
  )
  await storage.deleteMany([displayKey, detailKey])
  await storage.deleteMany([displayKey, detailKey])
  if (
    (await Promise.all([storage.get(displayKey), storage.get(detailKey)])).some(
      Boolean,
    )
  ) {
    throw new Error('MinIO repeated batch delete was not idempotent')
  }
} finally {
  await storage.deleteMany([displayKey, detailKey])
}

await payload.destroy()
console.log(
  'Media R3 integration passed: 31 NOT NULL columns, root/display equality, Row/StoredObject/body byte equality, four readable objects, and private MinIO idempotency',
)
process.exit(0)
