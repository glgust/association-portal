import 'dotenv/config'

import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres'
import { getPayload, type PayloadRequest } from 'payload'

import config from '../src/payload.config'
import * as m000 from '../src/migrations/20260712_135538_m000_bootstrap'
import * as m001 from '../src/migrations/20260713_102819_m001_business_baseline'
import * as m002 from '../src/migrations/20260713_113849_m002_form_version_schema_hash'
import * as m003 from '../src/migrations/20260713_123329_m003_review_concurrency_guard'
import * as m004 from '../src/migrations/20260714_064522_m004_announcement_publication'
import * as m005 from '../src/migrations/20260714_105537_m005_audit_read_permission'
import * as m006 from '../src/migrations/20260715_164312_m006_association_pages'
import * as m007 from '../src/migrations/20260716_162518_m007_activity_catalog'
import * as m008 from '../src/migrations/20260719_063428_m008_news_publication'
import * as m009 from '../src/migrations/20260727_150000_m009_identity_access_lifecycle'
import * as m010 from '../src/migrations/20260810_150000_m010_member_identity_account_claim'
import * as m011 from '../src/migrations/20260815_122906_m011_account_claim_recovery_status'
import * as m012 from '../src/migrations/20260827_142158_m012_media_gallery_publication'
import { hashFormSchema } from '../src/modules/recruitment/form-schema/schema-hash'

const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (
  databaseUrl.pathname !== '/ascnucc_demo_migration' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Migration probe may only reset the local ascnucc_demo_migration database',
  )
}

const payload = await getPayload({ config })
const db = payload.db.drizzle as MigrateUpArgs['db']
const args = {
  db,
  payload,
  req: {} as PayloadRequest,
}

async function resetPublicSchema(): Promise<void> {
  await db.execute(sql`DROP SCHEMA IF EXISTS "public" CASCADE`)
  await db.execute(sql`CREATE SCHEMA "public"`)
}

const cycleId = '00000000-0000-4000-8000-000000000001'
const definitionId = '00000000-0000-4000-8000-000000000002'
const formVersionId = '00000000-0000-4000-8000-000000000003'
const applicationId = '00000000-0000-4000-8000-000000000004'
const userId = '00000000-0000-4000-8000-000000000005'
const permissionOverrideId = '00000000-0000-4000-8000-000000000006'
const auditEventId = '00000000-0000-4000-8000-000000000007'
const associationPageId = '00000000-0000-4000-8000-000000000008'
const associationVersionId = '00000000-0000-4000-8000-000000000009'
const associationContactId = '00000000-0000-4000-8000-00000000000a'
const associationVersionContactRowId = '00000000-0000-4000-8000-00000000000b'
const activityId = '00000000-0000-4000-8000-00000000000c'
const activityVersionId = '00000000-0000-4000-8000-00000000000d'
const newsId = '00000000-0000-4000-8000-00000000000e'
const newsVersionId = '00000000-0000-4000-8000-00000000000f'
const m009UserIds = {
  admin: '00000000-0000-4000-8000-000000000011',
  cadre: '00000000-0000-4000-8000-000000000012',
  owner: '00000000-0000-4000-8000-000000000013',
  staff: '00000000-0000-4000-8000-000000000010',
} as const
const m009DuplicateOverrideIds = [
  '00000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000015',
] as const
const m009TriggerProbeUserId = '00000000-0000-4000-8000-000000000016'
const m010HistoricalMemberId = '00000000-0000-4000-8000-000000000019'
const m009ConcurrentOverrideIds = [
  '00000000-0000-4000-8000-000000000017',
  '00000000-0000-4000-8000-000000000018',
] as const
const oldPermissionValues = [
  'recruitment.application.read',
  'recruitment.application.review',
  'recruitment.form.manage',
]
const m004PermissionValues = [
  ...oldPermissionValues,
  'content.create',
  'content.edit',
  'content.directPublish',
]
const allPermissionValues = [...m004PermissionValues, 'audit.read']
const m009PermissionValues = [...allPermissionValues, 'accounts.manage']
const oldSchema = {
  fields: [
    { fieldId: 'fullName', label: '姓名', required: true, type: 'text' },
  ],
  schemaVersion: 1,
}

async function seedOldVersionFixture(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "recruitment_cycles" ("id", "code", "name", "status")
    VALUES (${cycleId}, 'migration-probe', 'Migration Probe', 'open')
  `)
  await db.execute(sql`
    INSERT INTO "form_definitions" ("id", "recruitment_cycle_id", "name", "draft_schema")
    VALUES (${definitionId}, ${cycleId}, 'Probe Form', ${JSON.stringify(oldSchema)}::jsonb)
  `)
  await db.execute(sql`
    INSERT INTO "form_versions" (
      "id", "form_definition_id", "recruitment_cycle_id", "version", "status", "schema", "published_at"
    ) VALUES (
      ${formVersionId}, ${definitionId}, ${cycleId}, 1, 'published',
      ${JSON.stringify(oldSchema)}::jsonb, '2026-07-13T00:00:00.000Z'
    )
  `)
  await db.execute(sql`
    INSERT INTO "membership_applications" (
      "id", "recruitment_cycle_id", "form_version_id", "status", "answers",
      "idempotency_key", "record_version", "submitted_at"
    ) VALUES (
      ${applicationId}, ${cycleId}, ${formVersionId}, 'pending',
      '{"fullName":"迁移测试"}'::jsonb, 'migration-probe-key', 1,
      '2026-07-13T00:01:00.000Z'
    )
  `)
}

async function seedM003CompatibilityFixture(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "auth_users" ("id", "display_name", "username", "role")
    VALUES (${userId}, 'Migration Probe User', 'migration-probe-user', 'staff')
  `)
  await db.execute(sql`
    INSERT INTO "permission_overrides" (
      "id", "user_id", "permission", "effect", "scope_type",
      "recruitment_cycle_id", "expires_at"
    ) VALUES (
      ${permissionOverrideId}, ${userId}, 'recruitment.application.review',
      'deny', 'recruitmentCycle', ${cycleId}, '2026-12-31T16:00:00.000Z'
    )
  `)
  await db.execute(sql`
    INSERT INTO "audit_events" (
      "id", "actor_id", "action", "target_type", "target_id", "request_id",
      "metadata", "occurred_at"
    ) VALUES (
      ${auditEventId}, ${userId}, 'migration.fixture.created', 'migration-probe',
      ${applicationId}, 'migration-probe-request', '{"fictional":true}'::jsonb,
      '2026-07-13T00:02:00.000Z'
    )
  `)
}

async function permissionEnumValues(): Promise<string[]> {
  const { rows } = await db.execute(sql`
    SELECT enum_value."enumlabel" AS "value"
    FROM "pg_type" enum_type
    JOIN "pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"
    JOIN "pg_namespace" namespace ON namespace."oid" = enum_type."typnamespace"
    WHERE namespace."nspname" = 'public'
      AND enum_type."typname" = 'enum_permission_overrides_permission'
    ORDER BY enum_value."enumsortorder"
  `)

  return (rows as Array<{ value: string }>).map(({ value }) => value)
}

function assertValues(
  actual: string[],
  expected: string[],
  message: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${message}: ${actual.join(', ')}`)
  }
}

type DatabaseErrorExpectation = {
  code: string
  constraint?: string
  marker?: string
}

function matchesDatabaseError(
  error: unknown,
  expectation: DatabaseErrorExpectation,
): boolean {
  const chain: Array<Record<string, unknown>> = []
  const seen = new Set<unknown>()
  let current = error

  while (
    typeof current === 'object' &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)
    const record = current as Record<string, unknown>
    chain.push(record)
    current = record.cause
  }

  const databaseError = chain.find(
    (candidate) => candidate.code === expectation.code,
  )
  if (!databaseError) return false
  if (
    expectation.constraint !== undefined &&
    databaseError.constraint !== expectation.constraint
  ) {
    return false
  }
  if (
    expectation.marker !== undefined &&
    !chain.some(
      (candidate) =>
        typeof candidate.message === 'string' &&
        candidate.message.includes(expectation.marker as string),
    )
  ) {
    return false
  }
  return true
}

function unwrapDatabaseError(
  error: unknown,
  expectedCode: string,
): Record<string, unknown> | null {
  const seen = new Set<unknown>()
  let current = error

  while (
    typeof current === 'object' &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)
    const candidate = current as Record<string, unknown>
    if (candidate.code === expectedCode) return candidate
    current = candidate.cause
  }

  return null
}

async function verifyM004Schema(
  expectedPermissions = m004PermissionValues,
): Promise<void> {
  const { rows: tableRows } = await db.execute(sql`
    SELECT
      to_regclass('public.announcements')::text AS "announcements",
      to_regclass('public._announcements_v')::text AS "versions"
  `)
  const tables = tableRows[0] as {
    announcements: null | string
    versions: null | string
  }
  if (
    tables.announcements !== 'announcements' ||
    tables.versions !== '_announcements_v'
  ) {
    throw new Error('M004 announcement or version table is missing')
  }

  const { rows: columnRows } = await db.execute(sql`
    SELECT "table_name", "column_name", "is_nullable"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND (
        ("table_name" = 'audit_events' AND "column_name" = 'result')
        OR
        ("table_name" = 'payload_locked_documents_rels' AND "column_name" = 'announcements_id')
      )
  `)
  const columns = columnRows as Array<{
    column_name: string
    is_nullable: string
    table_name: string
  }>
  if (
    !columns.some(
      (column) =>
        column.table_name === 'audit_events' &&
        column.column_name === 'result' &&
        column.is_nullable === 'NO',
    )
  ) {
    throw new Error('M004 audit result column is missing or nullable')
  }
  if (
    !columns.some(
      (column) =>
        column.table_name === 'payload_locked_documents_rels' &&
        column.column_name === 'announcements_id',
    )
  ) {
    throw new Error('M004 locked-document announcement column is missing')
  }

  const { rows: relationRows } = await db.execute(sql`
    SELECT COUNT(*)::integer AS "count"
    FROM "pg_constraint"
    WHERE "conname" = 'payload_locked_documents_rels_announcements_fk'
      AND "contype" = 'f'
  `)
  if ((relationRows[0] as { count: number }).count !== 1) {
    throw new Error('M004 locked-document announcement relation is missing')
  }

  assertValues(
    await permissionEnumValues(),
    expectedPermissions,
    'Permission enum values do not match the expected migration state',
  )
}

async function verifyM005Schema(
  expectedPermissions = allPermissionValues,
): Promise<void> {
  await verifyM004Schema(expectedPermissions)
}

async function enumValues(typeName: string): Promise<string[]> {
  const { rows } = await db.execute(sql`
    SELECT enum_value."enumlabel" AS "value"
    FROM "pg_type" enum_type
    JOIN "pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"
    JOIN "pg_namespace" namespace ON namespace."oid" = enum_type."typnamespace"
    WHERE namespace."nspname" = 'public'
      AND enum_type."typname" = ${typeName}
    ORDER BY enum_value."enumsortorder"
  `)

  return (rows as Array<{ value: string }>).map(({ value }) => value)
}

async function verifyM006Schema(
  expectEmpty: boolean,
  expectedPermissions = allPermissionValues,
): Promise<void> {
  await verifyM005Schema(expectedPermissions)

  const { rows: tableRows } = await db.execute(sql`
    SELECT
      to_regclass('public.association_pages')::text AS "pages",
      to_regclass('public.association_pages_contacts')::text AS "contacts",
      to_regclass('public._association_pages_v')::text AS "versions",
      to_regclass('public._association_pages_v_version_contacts')::text
        AS "version_contacts"
  `)
  const tables = tableRows[0] as {
    contacts: null | string
    pages: null | string
    version_contacts: null | string
    versions: null | string
  }
  if (
    tables.pages !== 'association_pages' ||
    tables.contacts !== 'association_pages_contacts' ||
    tables.versions !== '_association_pages_v' ||
    tables.version_contacts !== '_association_pages_v_version_contacts'
  ) {
    throw new Error('M006 association page tables are incomplete')
  }

  assertValues(
    await enumValues('enum_association_pages_contacts_type'),
    ['email', 'phone', 'qq', 'wechat', 'other'],
    'M006 contact type enum values do not match',
  )
  assertValues(
    await enumValues('enum_association_pages_page_key'),
    ['home', 'about', 'contact'],
    'M006 page key enum values do not match',
  )
  assertValues(
    await enumValues('enum_association_pages_status'),
    ['draft', 'published'],
    'M006 page status enum values do not match',
  )
  assertValues(
    await enumValues('enum__association_pages_v_version_contacts_type'),
    ['email', 'phone', 'qq', 'wechat', 'other'],
    'M006 version contact type enum values do not match',
  )
  assertValues(
    await enumValues('enum__association_pages_v_version_page_key'),
    ['home', 'about', 'contact'],
    'M006 version page key enum values do not match',
  )
  assertValues(
    await enumValues('enum__association_pages_v_version_status'),
    ['draft', 'published'],
    'M006 version status enum values do not match',
  )

  const expectedIndexes = [
    'association_pages_contacts_order_idx',
    'association_pages_contacts_parent_id_idx',
    'association_pages_page_key_idx',
    'association_pages_published_at_idx',
    'association_pages_created_by_idx',
    'association_pages_last_edited_by_idx',
    'association_pages_updated_at_idx',
    'association_pages_created_at_idx',
    'association_pages__status_idx',
    '_association_pages_v_version_contacts_order_idx',
    '_association_pages_v_version_contacts_parent_id_idx',
    '_association_pages_v_parent_idx',
    '_association_pages_v_version_version_page_key_idx',
    '_association_pages_v_version_version_published_at_idx',
    '_association_pages_v_version_version_created_by_idx',
    '_association_pages_v_version_version_last_edited_by_idx',
    '_association_pages_v_version_version_updated_at_idx',
    '_association_pages_v_version_version_created_at_idx',
    '_association_pages_v_version_version__status_idx',
    '_association_pages_v_created_at_idx',
    '_association_pages_v_updated_at_idx',
    '_association_pages_v_latest_idx',
    'payload_locked_documents_rels_association_pages_id_idx',
  ]
  const { rows: indexRows } = await db.execute(sql`
    SELECT "indexname"
    FROM "pg_indexes"
    WHERE "schemaname" = 'public'
      AND (
        "tablename" IN (
          'association_pages', 'association_pages_contacts',
          '_association_pages_v', '_association_pages_v_version_contacts'
        )
        OR "indexname" = 'payload_locked_documents_rels_association_pages_id_idx'
      )
  `)
  const actualIndexes = new Set(
    (indexRows as Array<{ indexname: string }>).map(
      ({ indexname }) => indexname,
    ),
  )
  const missingIndexes = expectedIndexes.filter(
    (indexName) => !actualIndexes.has(indexName),
  )
  if (missingIndexes.length > 0) {
    throw new Error(`M006 indexes are missing: ${missingIndexes.join(', ')}`)
  }

  const expectedRelations = [
    'association_pages_contacts_parent_id_fk',
    'association_pages_created_by_id_auth_users_id_fk',
    'association_pages_last_edited_by_id_auth_users_id_fk',
    '_association_pages_v_version_contacts_parent_id_fk',
    '_association_pages_v_parent_id_association_pages_id_fk',
    '_association_pages_v_version_created_by_id_auth_users_id_fk',
    '_association_pages_v_version_last_edited_by_id_auth_users_id_fk',
    'payload_locked_documents_rels_association_pages_fk',
  ]
  const { rows: relationRows } = await db.execute(sql`
    SELECT "conname"
    FROM "pg_constraint"
    WHERE "contype" = 'f'
      AND (
        "conrelid" IN (
          'association_pages'::regclass,
          'association_pages_contacts'::regclass,
          '_association_pages_v'::regclass,
          '_association_pages_v_version_contacts'::regclass
        )
        OR "conname" = 'payload_locked_documents_rels_association_pages_fk'
      )
  `)
  const actualRelations = new Set(
    (relationRows as Array<{ conname: string }>).map(({ conname }) => conname),
  )
  const missingRelations = expectedRelations.filter(
    (relationName) => !actualRelations.has(relationName),
  )
  if (missingRelations.length > 0) {
    throw new Error(
      `M006 relations are missing: ${missingRelations.join(', ')}`,
    )
  }

  const { rows: lockedColumnRows } = await db.execute(sql`
    SELECT "is_nullable"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND "table_name" = 'payload_locked_documents_rels'
      AND "column_name" = 'association_pages_id'
  `)
  if (lockedColumnRows.length !== 1) {
    throw new Error('M006 locked-document association page column is missing')
  }

  if (expectEmpty) {
    const { rows: countRows } = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::integer FROM "association_pages") AS "pages",
        (SELECT COUNT(*)::integer FROM "association_pages_contacts") AS "contacts",
        (SELECT COUNT(*)::integer FROM "_association_pages_v") AS "versions",
        (
          SELECT COUNT(*)::integer
          FROM "_association_pages_v_version_contacts"
        ) AS "version_contacts"
    `)
    const counts = countRows[0] as Record<string, number>
    if (Object.values(counts).some((count) => count !== 0)) {
      throw new Error('M006 wrote placeholder association page business rows')
    }
  }
}

async function verifyM007Schema(
  expectEmpty: boolean,
  expectedPermissions = allPermissionValues,
): Promise<void> {
  await verifyM006Schema(expectEmpty, expectedPermissions)

  const { rows: tableRows } = await db.execute(sql`
    SELECT
      to_regclass('public.activities')::text AS "activities",
      to_regclass('public._activities_v')::text AS "versions"
  `)
  const tables = tableRows[0] as {
    activities: null | string
    versions: null | string
  }
  if (
    tables.activities !== 'activities' ||
    tables.versions !== '_activities_v'
  ) {
    throw new Error('M007 activity tables are incomplete')
  }

  const { rows: projectionRows } = await db.execute(sql`
    SELECT "table_name", "column_name", "data_type"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND (
        ("table_name" = 'activities' AND "column_name" = 'history_sort_at')
        OR (
          "table_name" = '_activities_v'
          AND "column_name" = 'version_history_sort_at'
        )
      )
  `)
  const projections = new Map(
    (
      projectionRows as Array<{
        column_name: string
        data_type: string
        table_name: string
      }>
    ).map((row) => [`${row.table_name}.${row.column_name}`, row.data_type]),
  )
  if (
    projections.get('activities.history_sort_at') !==
      'timestamp with time zone' ||
    projections.get('_activities_v.version_history_sort_at') !==
      'timestamp with time zone'
  ) {
    throw new Error('M007 activity history projections are incomplete')
  }

  assertValues(
    await enumValues('enum_activities_activity_type'),
    ['temporary', 'standing'],
    'M007 activity type enum values do not match',
  )
  assertValues(
    await enumValues('enum_activities_status'),
    ['draft', 'published'],
    'M007 activity status enum values do not match',
  )
  assertValues(
    await enumValues('enum__activities_v_version_activity_type'),
    ['temporary', 'standing'],
    'M007 version activity type enum values do not match',
  )
  assertValues(
    await enumValues('enum__activities_v_version_status'),
    ['draft', 'published'],
    'M007 version status enum values do not match',
  )

  const expectedIndexes = [
    'activities_slug_idx',
    'activities_published_at_idx',
    'activities_history_sort_at_idx',
    'activities_created_by_idx',
    'activities_last_edited_by_idx',
    'activities_updated_at_idx',
    'activities_created_at_idx',
    'activities__status_idx',
    '_activities_v_parent_idx',
    '_activities_v_version_version_slug_idx',
    '_activities_v_version_version_published_at_idx',
    '_activities_v_version_version_history_sort_at_idx',
    '_activities_v_version_version_created_by_idx',
    '_activities_v_version_version_last_edited_by_idx',
    '_activities_v_version_version_updated_at_idx',
    '_activities_v_version_version_created_at_idx',
    '_activities_v_version_version__status_idx',
    '_activities_v_created_at_idx',
    '_activities_v_updated_at_idx',
    '_activities_v_latest_idx',
    'payload_locked_documents_rels_activities_id_idx',
  ]
  const { rows: indexRows } = await db.execute(sql`
    SELECT "indexname"
    FROM "pg_indexes"
    WHERE "schemaname" = 'public'
      AND (
        "tablename" IN ('activities', '_activities_v')
        OR "indexname" = 'payload_locked_documents_rels_activities_id_idx'
      )
  `)
  const actualIndexes = new Set(
    (indexRows as Array<{ indexname: string }>).map(
      ({ indexname }) => indexname,
    ),
  )
  const missingIndexes = expectedIndexes.filter(
    (indexName) => !actualIndexes.has(indexName),
  )
  if (missingIndexes.length > 0) {
    throw new Error(`M007 indexes are missing: ${missingIndexes.join(', ')}`)
  }

  const expectedRelations = [
    'activities_created_by_id_auth_users_id_fk',
    'activities_last_edited_by_id_auth_users_id_fk',
    '_activities_v_parent_id_activities_id_fk',
    '_activities_v_version_created_by_id_auth_users_id_fk',
    '_activities_v_version_last_edited_by_id_auth_users_id_fk',
    'payload_locked_documents_rels_activities_fk',
  ]
  const { rows: relationRows } = await db.execute(sql`
    SELECT "conname"
    FROM "pg_constraint"
    WHERE "contype" = 'f'
      AND (
        "conrelid" IN ('activities'::regclass, '_activities_v'::regclass)
        OR "conname" = 'payload_locked_documents_rels_activities_fk'
      )
  `)
  const actualRelations = new Set(
    (relationRows as Array<{ conname: string }>).map(({ conname }) => conname),
  )
  const missingRelations = expectedRelations.filter(
    (relationName) => !actualRelations.has(relationName),
  )
  if (missingRelations.length > 0) {
    throw new Error(
      `M007 relations are missing: ${missingRelations.join(', ')}`,
    )
  }

  const { rows: columnRows } = await db.execute(sql`
    SELECT "table_name", "column_name"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND (
        (
          "table_name" = 'payload_locked_documents_rels'
          AND "column_name" = 'activities_id'
        )
        OR (
          "table_name" IN ('activities', '_activities_v')
          AND "column_name" IN ('status', 'as_of', 'version_status', 'version_as_of')
        )
      )
  `)
  const columns = columnRows as Array<{
    column_name: string
    table_name: string
  }>
  if (
    !columns.some(
      ({ column_name, table_name }) =>
        table_name === 'payload_locked_documents_rels' &&
        column_name === 'activities_id',
    )
  ) {
    throw new Error('M007 locked-document activity column is missing')
  }
  if (
    columns.some(({ table_name }) =>
      ['activities', '_activities_v'].includes(table_name),
    )
  ) {
    throw new Error('M007 persisted a derived activity status or asOf column')
  }

  if (expectEmpty) {
    const { rows: countRows } = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::integer FROM "activities") AS "activities",
        (SELECT COUNT(*)::integer FROM "_activities_v") AS "versions"
    `)
    const counts = countRows[0] as Record<string, number>
    if (Object.values(counts).some((count) => count !== 0)) {
      throw new Error('M007 wrote placeholder activity business rows')
    }
  }
}

async function verifyM008Schema(
  expectEmpty: boolean,
  expectedPermissions = allPermissionValues,
): Promise<void> {
  await verifyM007Schema(expectEmpty, expectedPermissions)
  const { rows: tableRows } = await db.execute(sql`
    SELECT
      to_regclass('public.news')::text AS "news",
      to_regclass('public._news_v')::text AS "versions"
  `)
  const tables = tableRows[0] as {
    news: null | string
    versions: null | string
  }
  if (tables.news !== 'news' || tables.versions !== '_news_v') {
    throw new Error('M008 News tables are incomplete')
  }
  assertValues(
    await enumValues('enum_news_status'),
    ['draft', 'published'],
    'M008 News status enum values do not match',
  )
  assertValues(
    await enumValues('enum__news_v_version_status'),
    ['draft', 'published'],
    'M008 News version status enum values do not match',
  )

  const expectedIndexes = [
    'news_slug_idx',
    'news_published_at_idx',
    'news_created_by_idx',
    'news_last_edited_by_idx',
    'news_updated_at_idx',
    'news_created_at_idx',
    'news__status_idx',
    '_news_v_parent_idx',
    '_news_v_version_version_slug_idx',
    '_news_v_version_version_published_at_idx',
    '_news_v_version_version_created_by_idx',
    '_news_v_version_version_last_edited_by_idx',
    '_news_v_version_version_updated_at_idx',
    '_news_v_version_version_created_at_idx',
    '_news_v_version_version__status_idx',
    '_news_v_created_at_idx',
    '_news_v_updated_at_idx',
    '_news_v_latest_idx',
    'payload_locked_documents_rels_news_id_idx',
  ]
  const { rows: indexRows } = await db.execute(sql`
    SELECT "indexname"
    FROM "pg_indexes"
    WHERE "schemaname" = 'public'
      AND (
        "tablename" IN ('news', '_news_v')
        OR "indexname" = 'payload_locked_documents_rels_news_id_idx'
      )
  `)
  const indexes = new Set(
    (indexRows as Array<{ indexname: string }>).map(
      ({ indexname }) => indexname,
    ),
  )
  const missingIndexes = expectedIndexes.filter((name) => !indexes.has(name))
  if (missingIndexes.length > 0) {
    throw new Error(`M008 indexes are missing: ${missingIndexes.join(', ')}`)
  }

  const expectedRelations = [
    'news_created_by_id_auth_users_id_fk',
    'news_last_edited_by_id_auth_users_id_fk',
    '_news_v_parent_id_news_id_fk',
    '_news_v_version_created_by_id_auth_users_id_fk',
    '_news_v_version_last_edited_by_id_auth_users_id_fk',
    'payload_locked_documents_rels_news_fk',
  ]
  const { rows: relationRows } = await db.execute(sql`
    SELECT "conname"
    FROM "pg_constraint"
    WHERE "contype" = 'f'
      AND (
        "conrelid" IN ('news'::regclass, '_news_v'::regclass)
        OR "conname" = 'payload_locked_documents_rels_news_fk'
      )
  `)
  const relations = new Set(
    (relationRows as Array<{ conname: string }>).map(({ conname }) => conname),
  )
  const missingRelations = expectedRelations.filter(
    (name) => !relations.has(name),
  )
  if (missingRelations.length > 0) {
    throw new Error(
      `M008 relations are missing: ${missingRelations.join(', ')}`,
    )
  }

  const { rows: lockedRows } = await db.execute(sql`
    SELECT COUNT(*)::integer AS "count"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND "table_name" = 'payload_locked_documents_rels'
      AND "column_name" = 'news_id'
  `)
  if ((lockedRows[0] as { count: number }).count !== 1) {
    throw new Error('M008 locked-document News column is missing')
  }
  if (expectEmpty) {
    const { rows } = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::integer FROM "news") AS "news",
        (SELECT COUNT(*)::integer FROM "_news_v") AS "versions"
    `)
    if (
      Object.values(rows[0] as Record<string, number>).some(
        (count) => count !== 0,
      )
    ) {
      throw new Error('M008 wrote placeholder News business rows')
    }
  }
}

async function verifyM003CompatibilityFixture(): Promise<void> {
  const { rows: permissionRows } = await db.execute(sql`
    SELECT
      permission_override."user_id",
      permission_override."permission"::text AS "permission",
      permission_override."effect"::text AS "effect",
      permission_override."scope_type"::text AS "scope_type",
      permission_override."recruitment_cycle_id",
      permission_override."expires_at",
      auth_user."username",
      recruitment_cycle."code" AS "cycle_code"
    FROM "permission_overrides" permission_override
    JOIN "auth_users" auth_user ON auth_user."id" = permission_override."user_id"
    JOIN "recruitment_cycles" recruitment_cycle
      ON recruitment_cycle."id" = permission_override."recruitment_cycle_id"
    WHERE permission_override."id" = ${permissionOverrideId}
  `)
  const permission = permissionRows[0] as
    | {
        cycle_code: string
        effect: string
        expires_at: Date | string
        permission: string
        recruitment_cycle_id: string
        scope_type: string
        user_id: string
        username: string
      }
    | undefined
  if (
    !permission ||
    permission.user_id !== userId ||
    permission.permission !== 'recruitment.application.review' ||
    permission.effect !== 'deny' ||
    permission.scope_type !== 'recruitmentCycle' ||
    permission.recruitment_cycle_id !== cycleId ||
    permission.username !== 'migration-probe-user' ||
    permission.cycle_code !== 'migration-probe' ||
    new Date(permission.expires_at).toISOString() !== '2026-12-31T16:00:00.000Z'
  ) {
    throw new Error('M004 changed the historical permission override fixture')
  }

  const { rows: auditRows } = await db.execute(sql`
    SELECT
      audit_event."actor_id", audit_event."action", audit_event."target_type",
      audit_event."target_id", audit_event."request_id", audit_event."metadata",
      audit_event."occurred_at", audit_event."result", auth_user."username"
    FROM "audit_events" audit_event
    JOIN "auth_users" auth_user ON auth_user."id" = audit_event."actor_id"
    WHERE audit_event."id" = ${auditEventId}
  `)
  const audit = auditRows[0] as
    | {
        action: string
        actor_id: string
        metadata: Record<string, unknown>
        occurred_at: Date | string
        request_id: string
        result: string
        target_id: string
        target_type: string
        username: string
      }
    | undefined
  if (
    !audit ||
    audit.actor_id !== userId ||
    audit.username !== 'migration-probe-user' ||
    audit.action !== 'migration.fixture.created' ||
    audit.target_type !== 'migration-probe' ||
    audit.target_id !== applicationId ||
    audit.request_id !== 'migration-probe-request' ||
    audit.metadata.fictional !== true ||
    new Date(audit.occurred_at).toISOString() !== '2026-07-13T00:02:00.000Z' ||
    audit.result !== 'success'
  ) {
    throw new Error(
      'M004 changed or failed to backfill the historical audit fixture',
    )
  }
}

const migrationUps = [
  m000.up,
  m001.up,
  m002.up,
  m003.up,
  m004.up,
  m005.up,
  m006.up,
  m007.up,
  m008.up,
  m009.up,
  m010.up,
  m011.up,
] as const

const m011HistoricalIntakeId = '00000000-0000-4000-8000-000000000020'

async function seedHistoricalIntakeBeforeM011(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "member_intake_applications" (
      "id", "status", "name", "applicant_identity",
      "privacy_purpose_confirmed", "idempotency_key", "request_fingerprint",
      "submitted_at", "request_id", "record_version"
    ) VALUES (
      ${m011HistoricalIntakeId}, 'pendingReview', '虚构 M011 历史申请人',
      'member', true, '00000000-0000-4000-8000-000000000020',
      'm011-historical-fingerprint', '2026-08-14T00:00:00.000Z',
      'm011-historical-request', 1
    )
  `)
}

async function verifyM011Schema(expectHistorical: boolean): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT "table_name", "column_name", "is_nullable", "column_default"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND "table_name" IN ('account_claims', 'member_intake_applications')
      AND "column_name" IN (
        'public_message', 'status_access_version', 'status_access_issued_at'
      )
  `)
  if (rows.length !== 6)
    throw new Error('M011 status/message columns are missing')
  for (const row of rows as Array<Record<string, unknown>>) {
    if (
      row.column_name === 'status_access_version' &&
      (row.is_nullable !== 'NO' || !String(row.column_default).includes('1'))
    ) {
      throw new Error('M011 statusAccessVersion is not enforced')
    }
  }
  const { rows: historicalRows } = await db.execute(sql`
    SELECT "status_access_version", "status_access_issued_at", "public_message"
    FROM "member_intake_applications" WHERE "id" = ${m011HistoricalIntakeId}
  `)
  if (expectHistorical) {
    const historical = historicalRows[0] as Record<string, unknown>
    if (
      Number(historical?.status_access_version) !== 1 ||
      historical?.status_access_issued_at !== null ||
      historical?.public_message !== null
    ) {
      throw new Error('M011 fabricated a historical receipt or public message')
    }
  } else if (historicalRows.length !== 0) {
    throw new Error('Fresh M011 unexpectedly created status records')
  }
}

async function verifyM012Schema(): Promise<void> {
  const { rows: tableRows } = await db.execute(sql`
    SELECT "table_name"
    FROM "information_schema"."tables"
    WHERE "table_schema" = 'public'
      AND "table_name" IN ('media_assets', 'gallery_works', '_gallery_works_v')
  `)
  if (tableRows.length !== 3)
    throw new Error('M012 media/gallery tables are missing')

  const { rows: requiredRows } = await db.execute(sql`
    SELECT "column_name", "is_nullable"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public' AND "table_name" = 'media_assets'
      AND "column_name" IN (
        'object_prefix', 'sha256', 'mime_type', 'width', 'height', 'byte_size',
        'display_object_key', 'display_sha256', 'display_mime_type',
        'display_width', 'display_height', 'display_byte_size',
        'detail_object_key', 'detail_sha256', 'detail_mime_type',
        'detail_width', 'detail_height', 'detail_byte_size',
        'list_object_key', 'list_sha256', 'list_mime_type',
        'list_width', 'list_height', 'list_byte_size',
        'thumbnail_object_key', 'thumbnail_sha256', 'thumbnail_mime_type',
        'thumbnail_width', 'thumbnail_height', 'thumbnail_byte_size',
        'created_by_id'
      )
  `)
  if (
    requiredRows.length !== 31 ||
    requiredRows.some(
      (row) => (row as { is_nullable: string }).is_nullable !== 'NO',
    )
  ) {
    throw new Error('M012 MediaAsset completeness columns are not enforced')
  }

  const { rows: relationRows } = await db.execute(sql`
    SELECT constraint_name, delete_rule
    FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name IN (
        'media_assets_created_by_id_auth_users_id_fk',
        'gallery_works_media_id_media_assets_id_fk',
        'gallery_works_author_id_auth_users_id_fk',
        'gallery_works_created_by_id_auth_users_id_fk',
        'gallery_works_last_edited_by_id_auth_users_id_fk'
      )
  `)
  if (
    relationRows.length !== 5 ||
    relationRows.some(
      (row) => (row as { delete_rule: string }).delete_rule !== 'NO ACTION',
    )
  ) {
    throw new Error('M012 author/media/Actor relationships are not restrictive')
  }

  const { rows: lockedRows } = await db.execute(sql`
    SELECT "column_name"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND "table_name" = 'payload_locked_documents_rels'
      AND "column_name" IN ('gallery_works_id', 'media_assets_id')
  `)
  if (lockedRows.length !== 2)
    throw new Error('M012 lock-document relations are missing')

  const { rows: businessRows } = await db.execute(sql`
    SELECT
      (SELECT count(*)::integer FROM "media_assets") AS media_count,
      (SELECT count(*)::integer FROM "gallery_works") AS gallery_count,
      (SELECT count(*)::integer FROM "_gallery_works_v") AS version_count
  `)
  const counts = businessRows[0] as Record<string, number>
  if (counts.media_count || counts.gallery_count || counts.version_count) {
    throw new Error('M012 fabricated MediaAsset or GalleryWork business rows')
  }
}

async function seedHistoricalMemberBeforeM010(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "members" (
      "id", "student_number", "name", "source_application_id", "confirmed_at"
    ) VALUES (
      ${m010HistoricalMemberId}, 'M010-HISTORICAL-STUDENT',
      '虚构 M010 历史会员', ${applicationId}, '2026-07-13T00:03:00.000Z'
    )
  `)
}

async function verifyM010Schema(
  expectHistoricalMember: boolean,
): Promise<void> {
  const { rows: tableRows } = await db.execute(sql`
    SELECT "table_name"
    FROM "information_schema"."tables"
    WHERE "table_schema" = 'public'
      AND "table_name" IN (
        'members_contacts', 'account_claims', 'account_claims_contacts',
        'member_intake_applications', 'member_intake_applications_contacts'
      )
    ORDER BY "table_name"
  `)
  if (tableRows.length !== 5) {
    throw new Error('M010 membership tables are missing')
  }

  const { rows: indexRows } = await db.execute(sql`
    SELECT "indexname"
    FROM "pg_indexes"
    WHERE "schemaname" = 'public'
      AND "indexname" IN (
        'members_auth_user_idx', 'account_claims_active_member_idx',
        'account_claims_active_auth_user_idx',
        'account_claims_idempotency_key_idx',
        'member_intake_applications_idempotency_key_idx'
      )
  `)
  if (indexRows.length !== 5) {
    throw new Error(
      'M010 exact relationship, claim, or idempotency indexes are missing',
    )
  }

  const roleValues = await db.execute(sql`
    SELECT enum_value."enumlabel" AS "value"
    FROM "pg_type" enum_type
    JOIN "pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"
    WHERE enum_type."typname" = 'enum_auth_users_role'
    ORDER BY enum_value."enumsortorder"
  `)
  if (
    !(roleValues.rows as Array<{ value: string }>).some(
      ({ value }) => value === 'member',
    )
  ) {
    throw new Error('M010 member AuthUser role is missing')
  }

  const statusValues = await db.execute(sql`
    SELECT enum_value."enumlabel" AS "value"
    FROM "pg_type" enum_type
    JOIN "pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"
    WHERE enum_type."typname" = 'enum_auth_users_status'
    ORDER BY enum_value."enumsortorder"
  `)
  const statuses = new Set(
    (statusValues.rows as Array<{ value: string }>).map(({ value }) => value),
  )
  for (const status of ['pendingClaim', 'pendingApproval', 'claimBlocked']) {
    if (!statuses.has(status))
      throw new Error(`M010 AuthUser status is missing: ${status}`)
  }

  const { rows: historicalRows } = await db.execute(sql`
    SELECT "student_number", "source_application_id", "membership_identity",
      "major", "source", "auth_user_id", "record_version"
    FROM "members"
    WHERE "id" = ${m010HistoricalMemberId}
  `)
  if (expectHistoricalMember) {
    const historical = historicalRows[0] as Record<string, unknown> | undefined
    if (
      !historical ||
      historical.student_number !== 'M010-HISTORICAL-STUDENT' ||
      historical.source_application_id !== applicationId ||
      historical.membership_identity !== null ||
      historical.major !== null ||
      historical.source !== null ||
      historical.auth_user_id !== null ||
      Number(historical.record_version) !== 1
    ) {
      throw new Error('M010 guessed or changed historical Member identity data')
    }
  } else if (historicalRows.length !== 0) {
    throw new Error('Fresh M010 unexpectedly created Member data')
  }

  await verifyM009TriggerInstallation()
}

async function migrateFromAfter(
  appliedMigrationIndex: number,
  finalMigrationIndex = migrationUps.length - 1,
): Promise<void> {
  for (
    let migrationIndex = appliedMigrationIndex + 1;
    migrationIndex <= finalMigrationIndex;
    migrationIndex += 1
  ) {
    await migrationUps[migrationIndex](args)
  }
}

async function seedRepresentativeM009Account(
  checkpoint: 0 | 1 | 5 | 8,
): Promise<{
  accessExpiresAt: null | string
  role: 'admin' | 'cadre' | 'owner' | 'staff'
  userId: string
}> {
  const fixtures = {
    0: { role: 'staff', userId: m009UserIds.staff },
    1: { role: 'cadre', userId: m009UserIds.cadre },
    5: { role: 'admin', userId: m009UserIds.admin },
    8: { role: 'owner', userId: m009UserIds.owner },
  } as const
  const fixture = fixtures[checkpoint]
  const accessExpiresAt =
    checkpoint === 0
      ? null
      : `2027-0${checkpoint === 1 ? '1' : '2'}-01T00:00:00.000Z`

  if (checkpoint === 0) {
    await db.execute(sql`
      INSERT INTO "auth_users" (
        "id", "display_name", "username", "salt", "hash", "login_attempts"
      ) VALUES (
        ${fixture.userId}, '虚构 M000 历史账号', 'm009-m000-probe',
        'fictional-salt-m000', 'fictional-hash-m000', 2
      )
    `)
  } else {
    await db.execute(sql`
      INSERT INTO "auth_users" (
        "id", "display_name", "username", "salt", "hash", "login_attempts",
        "role", "access_expires_at"
      ) VALUES (
        ${fixture.userId}, ${`虚构 M00${checkpoint} 历史账号`},
        ${`m009-m00${checkpoint}-probe`}, ${`fictional-salt-m00${checkpoint}`},
        ${`fictional-hash-m00${checkpoint}`}, 2, ${fixture.role}, ${accessExpiresAt}
      )
    `)
  }
  await db.execute(sql`
    INSERT INTO "auth_users_sessions" (
      "_order", "_parent_id", "id", "created_at", "expires_at"
    ) VALUES (
      1, ${fixture.userId}, ${`fictional-session-m00${checkpoint}`},
      '2026-07-27T00:00:00.000Z', '2027-07-27T00:00:00.000Z'
    )
  `)
  return { accessExpiresAt, ...fixture }
}

async function verifyRepresentativeM009Upgrades(): Promise<void> {
  for (const checkpoint of [0, 1, 5, 8] as const) {
    await resetPublicSchema()
    await migrateFromAfter(-1, checkpoint)
    const fixture = await seedRepresentativeM009Account(checkpoint)
    await migrateFromAfter(checkpoint)
    await verifyM009TriggerInstallation()

    const { rows } = await db.execute(sql`
      SELECT
        "account_type"::text AS "account_type", "student_number",
        "status"::text AS "status", "default_role_expires_at",
        "temporary_credential_expires_at", "record_version"::integer AS "record_version",
        "role"::text AS "role", "access_expires_at", "salt", "hash",
        "login_attempts"::integer AS "login_attempts",
        (SELECT COUNT(*)::integer FROM "auth_users_sessions" session
          WHERE session."_parent_id" = auth_user."id") AS "session_count"
      FROM "auth_users" auth_user
      WHERE "id" = ${fixture.userId}
    `)
    const row = rows[0] as
      | {
          access_expires_at: Date | null | string
          account_type: string
          default_role_expires_at: Date | null | string
          hash: string
          login_attempts: number
          record_version: number
          role: string
          salt: string
          session_count: number
          status: string
          student_number: null | string
          temporary_credential_expires_at: Date | null | string
        }
      | undefined
    const expectedExpiry = fixture.accessExpiresAt
    if (
      !row ||
      row.account_type !== 'external' ||
      row.student_number !== null ||
      row.status !== 'active' ||
      row.temporary_credential_expires_at !== null ||
      row.record_version !== 1 ||
      row.role !== fixture.role ||
      row.salt !== `fictional-salt-m00${checkpoint}` ||
      row.hash !== `fictional-hash-m00${checkpoint}` ||
      row.login_attempts !== 2 ||
      row.session_count !== 1 ||
      (row.access_expires_at === null
        ? expectedExpiry !== null
        : new Date(row.access_expires_at).toISOString() !== expectedExpiry) ||
      (row.default_role_expires_at === null
        ? expectedExpiry !== null
        : new Date(row.default_role_expires_at).toISOString() !==
          expectedExpiry)
    ) {
      throw new Error(
        `M00${checkpoint}→M009 account backfill changed historical identity state`,
      )
    }
  }
}

async function verifyM009TriggerInstallation(): Promise<void> {
  const { rows: functionRows } = await db.execute(sql`
    SELECT
      procedure."proname" AS "name",
      namespace."nspname" AS "schema",
      procedure."pronargs"::integer AS "argument_count",
      procedure."prorettype" = 'trigger'::regtype AS "returns_trigger"
    FROM "pg_proc" procedure
    JOIN "pg_namespace" namespace ON namespace."oid" = procedure."pronamespace"
    WHERE namespace."nspname" = 'public'
      AND procedure."proname" = 'm009_reject_auth_user_record_version_regression'
  `)
  const migrationFunction = functionRows[0] as
    | {
        argument_count: number
        name: string
        returns_trigger: boolean
        schema: string
      }
    | undefined
  if (
    functionRows.length !== 1 ||
    !migrationFunction ||
    migrationFunction.schema !== 'public' ||
    migrationFunction.name !==
      'm009_reject_auth_user_record_version_regression' ||
    migrationFunction.argument_count !== 0 ||
    migrationFunction.returns_trigger !== true
  ) {
    throw new Error('M009 record-version guard function is missing or invalid')
  }

  const { rows: triggerRows } = await db.execute(sql`
    SELECT
      trigger."tgname" AS "name",
      trigger."tgtype"::integer AS "type_bits",
      trigger."tgenabled" AS "enabled",
      function_namespace."nspname" AS "function_schema",
      procedure."proname" AS "function_name"
    FROM "pg_trigger" trigger
    JOIN "pg_class" relation ON relation."oid" = trigger."tgrelid"
    JOIN "pg_namespace" relation_namespace
      ON relation_namespace."oid" = relation."relnamespace"
    JOIN "pg_proc" procedure ON procedure."oid" = trigger."tgfoid"
    JOIN "pg_namespace" function_namespace
      ON function_namespace."oid" = procedure."pronamespace"
    WHERE relation_namespace."nspname" = 'public'
      AND relation."relname" = 'auth_users'
      AND trigger."tgname" = 'auth_users_record_version_no_regression'
      AND NOT trigger."tgisinternal"
  `)
  const migrationTrigger = triggerRows[0] as
    | {
        enabled: string
        function_name: string
        function_schema: string
        name: string
        type_bits: number
      }
    | undefined
  if (
    triggerRows.length !== 1 ||
    !migrationTrigger ||
    migrationTrigger.name !== 'auth_users_record_version_no_regression' ||
    migrationTrigger.type_bits !== 19 ||
    migrationTrigger.enabled !== 'O' ||
    migrationTrigger.function_schema !== 'public' ||
    migrationTrigger.function_name !==
      'm009_reject_auth_user_record_version_regression'
  ) {
    throw new Error(
      'M009 BEFORE UPDATE FOR EACH ROW record-version trigger is missing or invalid',
    )
  }
}

async function verifyM009TriggerAbsent(): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT
      to_regprocedure(
        'public.m009_reject_auth_user_record_version_regression()'
      )::text AS "migration_function",
      (
        SELECT COUNT(*)::integer
        FROM "pg_trigger" trigger
        JOIN "pg_class" relation ON relation."oid" = trigger."tgrelid"
        JOIN "pg_namespace" namespace ON namespace."oid" = relation."relnamespace"
        WHERE namespace."nspname" = 'public'
          AND relation."relname" = 'auth_users'
          AND trigger."tgname" = 'auth_users_record_version_no_regression'
          AND NOT trigger."tgisinternal"
      ) AS "trigger_count"
  `)
  const artifacts = rows[0] as {
    migration_function: null | string
    trigger_count: number
  }
  if (artifacts.migration_function !== null || artifacts.trigger_count !== 0) {
    throw new Error('Rejected M009 preflight left its function or trigger')
  }
}

async function verifyM009RecordVersionGuard(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "auth_users" (
      "id", "display_name", "username", "role", "salt", "hash",
      "account_type", "status", "record_version", "login_attempts"
    ) VALUES (
      ${m009TriggerProbeUserId}, '虚构版本防回退探针', 'm009-version-probe',
      'staff', 'fictional-version-salt', 'fictional-version-hash',
      'external', 'active', 7, 0
    )
  `)

  await db.execute(sql`
    UPDATE "auth_users"
    SET
      "display_name" = '虚构等版本 Session 写回',
      "username" = 'm009-version-probe',
      "role" = 'staff',
      "salt" = 'fictional-version-salt',
      "hash" = 'fictional-version-hash',
      "account_type" = 'external',
      "student_number" = NULL,
      "status" = 'active',
      "default_role_expires_at" = NULL,
      "temporary_credential_expires_at" = NULL,
      "record_version" = 7,
      "login_attempts" = 1
    WHERE "id" = ${m009TriggerProbeUserId}
  `)
  const { rows: equalVersionRows } = await db.execute(sql`
    SELECT "record_version"::integer AS "record_version",
      "login_attempts"::integer AS "login_attempts"
    FROM "auth_users"
    WHERE "id" = ${m009TriggerProbeUserId}
  `)
  const equalVersion = equalVersionRows[0] as
    | { login_attempts: number; record_version: number }
    | undefined
  if (
    !equalVersion ||
    equalVersion.record_version !== 7 ||
    equalVersion.login_attempts !== 1
  ) {
    throw new Error('M009 rejected or changed an equal-version Session update')
  }

  await db.execute(sql`
    UPDATE "auth_users"
    SET "status" = 'disabled', "record_version" = 8
    WHERE "id" = ${m009TriggerProbeUserId}
  `)
  const { rows: managementRows } = await db.execute(sql`
    SELECT "status"::text AS "status", "record_version"::integer AS "record_version"
    FROM "auth_users"
    WHERE "id" = ${m009TriggerProbeUserId}
  `)
  const managementUpdate = managementRows[0] as
    | { record_version: number; status: string }
    | undefined
  if (
    !managementUpdate ||
    managementUpdate.status !== 'disabled' ||
    managementUpdate.record_version !== 8
  ) {
    throw new Error('M009 rejected or changed an N-to-N+1 management update')
  }

  const { rows: beforeRows } = await db.execute(sql`
    SELECT to_jsonb(auth_user) AS "snapshot"
    FROM "auth_users" auth_user
    WHERE "id" = ${m009TriggerProbeUserId}
  `)
  const before = (beforeRows[0] as { snapshot: unknown }).snapshot
  let staleWriteRejected = false
  try {
    await db.execute(sql`
      UPDATE "auth_users"
      SET
        "display_name" = '虚构旧版本整行写回',
        "status" = 'active',
        "hash" = 'fictional-stale-hash',
        "salt" = 'fictional-stale-salt',
        "login_attempts" = 2,
        "record_version" = 7
      WHERE "id" = ${m009TriggerProbeUserId}
    `)
  } catch (error) {
    const databaseError = unwrapDatabaseError(error, '40001')
    if (
      databaseError?.message === 'M009_AUTH_USER_STALE_WRITE' &&
      databaseError.code === '40001'
    ) {
      staleWriteRejected = true
    } else {
      throw error
    }
  }
  if (!staleWriteRejected) {
    throw new Error('M009 accepted an old-version whole-row write')
  }

  const { rows: afterRows } = await db.execute(sql`
    SELECT to_jsonb(auth_user) AS "snapshot"
    FROM "auth_users" auth_user
    WHERE "id" = ${m009TriggerProbeUserId}
  `)
  const after = (afterRows[0] as { snapshot: unknown }).snapshot
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error('Rejected M009 stale write changed the AuthUser row')
  }
}

async function verifyM009Schema(
  expectEmpty: boolean,
  expectedStatusValues = ['pendingActivation', 'active', 'disabled'],
): Promise<void> {
  await verifyM008Schema(expectEmpty, m009PermissionValues)
  assertValues(
    await permissionEnumValues(),
    m009PermissionValues,
    'M009 permission enum values do not match the frozen registry',
  )
  await verifyM009TriggerInstallation()
  assertValues(
    await enumValues('enum_auth_users_account_type'),
    ['student', 'external'],
    'M009 account type enum values are invalid',
  )
  assertValues(
    await enumValues('enum_auth_users_status'),
    expectedStatusValues,
    'M009 account status enum values are invalid',
  )

  const { rows: columnRows } = await db.execute(sql`
    SELECT "column_name", "is_nullable", "column_default", "udt_name"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND "table_name" = 'auth_users'
      AND "column_name" IN (
        'access_expires_at', 'account_type', 'student_number', 'status',
        'default_role_expires_at', 'temporary_credential_expires_at', 'record_version'
      )
  `)
  const columns = columnRows as Array<{
    column_default: null | string
    column_name: string
    is_nullable: string
    udt_name: string
  }>
  const requiredColumns = new Map(
    columns.map((column) => [column.column_name, column]),
  )
  if (
    columns.length !== 7 ||
    requiredColumns.get('access_expires_at')?.is_nullable !== 'YES' ||
    requiredColumns.get('account_type')?.is_nullable !== 'NO' ||
    !requiredColumns
      .get('account_type')
      ?.column_default?.includes('external') ||
    requiredColumns.get('status')?.is_nullable !== 'NO' ||
    !requiredColumns
      .get('status')
      ?.column_default?.includes('pendingActivation') ||
    requiredColumns.get('record_version')?.is_nullable !== 'NO' ||
    !requiredColumns.get('record_version')?.column_default?.includes('1')
  ) {
    throw new Error(
      'M009 AuthUser columns, defaults, or legacy column are inconsistent',
    )
  }

  const { rows: constraintRows } = await db.execute(sql`
    SELECT "conname" AS "name", "contype" AS "type", pg_get_constraintdef("oid") AS "definition"
    FROM "pg_constraint"
    WHERE "conname" IN (
      'auth_users_identity_shape',
      'permission_overrides_grant_attribution',
      'permission_overrides_revoke_attribution',
      'permission_overrides_granted_by_id_auth_users_id_fk',
      'permission_overrides_revoked_by_id_auth_users_id_fk'
    )
  `)
  const constraints = new Map(
    (
      constraintRows as Array<{
        definition: string
        name: string
        type: string
      }>
    ).map((constraint) => [constraint.name, constraint]),
  )
  if (
    constraints.get('auth_users_identity_shape')?.type !== 'c' ||
    !constraints
      .get('auth_users_identity_shape')
      ?.definition.toLowerCase()
      .includes('student_number is not null') ||
    constraints.get('permission_overrides_grant_attribution')?.type !== 'c' ||
    !constraints
      .get('permission_overrides_grant_attribution')
      ?.definition.toLowerCase()
      .includes('btrim') ||
    !constraints
      .get('permission_overrides_grant_attribution')
      ?.definition.toLowerCase()
      .includes('reason is not null') ||
    constraints.get('permission_overrides_revoke_attribution')?.type !== 'c' ||
    constraints.get('permission_overrides_granted_by_id_auth_users_id_fk')
      ?.type !== 'f' ||
    !constraints
      .get('permission_overrides_granted_by_id_auth_users_id_fk')
      ?.definition.includes('auth_users(id)') ||
    constraints.get('permission_overrides_revoked_by_id_auth_users_id_fk')
      ?.type !== 'f' ||
    !constraints
      .get('permission_overrides_revoked_by_id_auth_users_id_fk')
      ?.definition.includes('auth_users(id)')
  ) {
    throw new Error(
      'M009 checks or AuthUser attribution foreign keys are missing',
    )
  }

  const { rows: indexRows } = await db.execute(sql`
    SELECT "indexname", "indexdef"
    FROM "pg_indexes"
    WHERE "schemaname" = 'public'
      AND "indexname" IN (
        'auth_users_student_number_idx',
        'permission_overrides_active_global_idx',
        'permission_overrides_active_cycle_idx'
      )
  `)
  const indexes = new Map(
    (indexRows as Array<{ indexdef: string; indexname: string }>).map(
      (index) => [index.indexname, index.indexdef],
    ),
  )
  const globalIndex =
    indexes.get('permission_overrides_active_global_idx') ?? ''
  const cycleIndex = indexes.get('permission_overrides_active_cycle_idx') ?? ''
  if (
    !indexes.get('auth_users_student_number_idx')?.includes('UNIQUE INDEX') ||
    !globalIndex.includes('UNIQUE INDEX') ||
    !globalIndex.includes('revoked_at') ||
    !globalIndex.includes('IS NULL') ||
    !globalIndex.includes("'global'") ||
    !cycleIndex.includes('UNIQUE INDEX') ||
    !cycleIndex.includes('recruitment_cycle_id') ||
    !cycleIndex.includes('revoked_at') ||
    !cycleIndex.includes('IS NULL') ||
    !cycleIndex.includes("'recruitmentCycle'")
  ) {
    throw new Error(
      'M009 student number or active override partial unique index is invalid',
    )
  }

  if (expectEmpty) {
    const { rows } = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::integer FROM "auth_users") AS "auth_users",
        (SELECT COUNT(*)::integer FROM "permission_overrides") AS "permission_overrides"
    `)
    const counts = rows[0] as {
      auth_users: number
      permission_overrides: number
    }
    if (counts.auth_users !== 0 || counts.permission_overrides !== 0) {
      throw new Error('Fresh M009 unexpectedly created identity data')
    }
  }
}

async function verifyM009LegacyAttribution(): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT "reason", "granted_by_id", "granted_at", "revoked_by_id", "revoked_at"
    FROM "permission_overrides"
    WHERE "id" = ${permissionOverrideId}
  `)
  const row = rows[0] as
    | {
        granted_at: null | string
        granted_by_id: null | string
        reason: null | string
        revoked_at: null | string
        revoked_by_id: null | string
      }
    | undefined
  if (
    !row ||
    row.reason !== null ||
    row.granted_by_id !== null ||
    row.granted_at !== null ||
    row.revoked_by_id !== null ||
    row.revoked_at !== null
  ) {
    throw new Error(
      'M009 fabricated or partially populated historical override attribution',
    )
  }

  let grantRejected = false
  try {
    await db.execute(sql`
      UPDATE "permission_overrides"
      SET "reason" = 'invalid partial attribution'
      WHERE "id" = ${permissionOverrideId}
    `)
  } catch (error) {
    if (
      matchesDatabaseError(error, {
        code: '23514',
        constraint: 'permission_overrides_grant_attribution',
      })
    ) {
      grantRejected = true
    } else {
      throw error
    }
  }
  if (!grantRejected) {
    throw new Error('M009 accepted partial grant attribution')
  }

  let revokeRejected = false
  try {
    await db.execute(sql`
      UPDATE "permission_overrides"
      SET "revoked_at" = '2026-07-27T12:00:00.000Z'
      WHERE "id" = ${permissionOverrideId}
    `)
  } catch (error) {
    if (
      matchesDatabaseError(error, {
        code: '23514',
        constraint: 'permission_overrides_revoke_attribution',
      })
    ) {
      revokeRejected = true
    } else {
      throw error
    }
  }
  if (!revokeRejected) {
    throw new Error('M009 accepted partial revoke attribution')
  }

  const { rows: unchangedRows } = await db.execute(sql`
    SELECT "reason", "granted_by_id", "granted_at", "revoked_by_id", "revoked_at"
    FROM "permission_overrides"
    WHERE "id" = ${permissionOverrideId}
  `)
  const unchanged = unchangedRows[0] as
    | {
        granted_at: null | string
        granted_by_id: null | string
        reason: null | string
        revoked_at: null | string
        revoked_by_id: null | string
      }
    | undefined
  if (
    !unchanged ||
    unchanged.reason !== null ||
    unchanged.granted_by_id !== null ||
    unchanged.granted_at !== null ||
    unchanged.revoked_by_id !== null ||
    unchanged.revoked_at !== null
  ) {
    throw new Error('Rejected partial attribution still changed the legacy row')
  }
}

async function verifyM009NullCheckConstraints(): Promise<void> {
  const authUserSnapshot = async () => {
    const { rows } = await db.execute(sql`
      SELECT to_jsonb(row) AS "value"
      FROM "auth_users" row
      WHERE "id" = ${userId}
    `)
    return JSON.stringify((rows[0] as { value: unknown } | undefined)?.value)
  }
  const permissionOverrideSnapshot = async () => {
    const { rows } = await db.execute(sql`
      SELECT to_jsonb(row) AS "value"
      FROM "permission_overrides" row
      WHERE "id" = ${permissionOverrideId}
    `)
    return JSON.stringify((rows[0] as { value: unknown } | undefined)?.value)
  }

  const expectCheckRejected = async (input: {
    before: string
    constraint: string
    label: string
    operation: () => Promise<unknown>
    snapshot: () => Promise<string>
  }) => {
    let rejected = false
    try {
      await input.operation()
    } catch (error) {
      if (
        matchesDatabaseError(error, {
          code: '23514',
          constraint: input.constraint,
        })
      ) {
        rejected = true
      } else {
        throw error
      }
    }
    if (!rejected) throw new Error(`M009 accepted ${input.label}`)
    if ((await input.snapshot()) !== input.before) {
      throw new Error(`Rejected ${input.label} changed its database row`)
    }
  }

  const authUserBefore = await authUserSnapshot()
  await expectCheckRejected({
    before: authUserBefore,
    constraint: 'auth_users_identity_shape',
    label: 'a student account with a NULL student number',
    operation: () =>
      db.execute(sql`
        UPDATE "auth_users"
        SET "account_type" = 'student', "student_number" = NULL
        WHERE "id" = ${userId}
      `),
    snapshot: authUserSnapshot,
  })

  const overrideBefore = await permissionOverrideSnapshot()
  await expectCheckRejected({
    before: overrideBefore,
    constraint: 'permission_overrides_grant_attribution',
    label: 'complete grant actors and time with a NULL reason',
    operation: () =>
      db.execute(sql`
        UPDATE "permission_overrides"
        SET "reason" = NULL,
            "granted_by_id" = ${userId},
            "granted_at" = '2026-07-27T12:00:00.000Z'
        WHERE "id" = ${permissionOverrideId}
      `),
    snapshot: permissionOverrideSnapshot,
  })
  await expectCheckRejected({
    before: overrideBefore,
    constraint: 'permission_overrides_grant_attribution',
    label: 'complete grant actors and time with a blank reason',
    operation: () =>
      db.execute(sql`
        UPDATE "permission_overrides"
        SET "reason" = '   ',
            "granted_by_id" = ${userId},
            "granted_at" = '2026-07-27T12:00:00.000Z'
        WHERE "id" = ${permissionOverrideId}
      `),
    snapshot: permissionOverrideSnapshot,
  })
}

async function verifyM009ConcurrentUniqueConflict(): Promise<void> {
  const attempts = await Promise.allSettled(
    m009ConcurrentOverrideIds.map((overrideId) =>
      db.execute(sql`
        INSERT INTO "permission_overrides" (
          "id", "user_id", "permission", "effect", "scope_type",
          "reason", "granted_by_id", "granted_at"
        ) VALUES (
          ${overrideId}, ${userId}, 'audit.read', 'allow', 'global',
          '虚构 M009 并发唯一冲突验收', ${userId},
          '2026-07-27T12:30:00.000Z'
        )
      `),
    ),
  )
  const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled')
  const rejected = attempts.filter((attempt) => attempt.status === 'rejected')
  if (
    fulfilled.length !== 1 ||
    rejected.length !== 1 ||
    !matchesDatabaseError(rejected[0]?.reason, {
      code: '23505',
      constraint: 'permission_overrides_active_global_idx',
    })
  ) {
    throw new Error(
      'M009 concurrent active override did not fail on the exact global index',
    )
  }

  const { rows } = await db.execute(sql`
    SELECT COUNT(*)::integer AS "count"
    FROM "permission_overrides"
    WHERE "id" IN (
      ${m009ConcurrentOverrideIds[0]}, ${m009ConcurrentOverrideIds[1]}
    )
  `)
  if ((rows[0] as { count: number } | undefined)?.count !== 1) {
    throw new Error('M009 concurrent unique conflict did not leave one row')
  }
}

async function verifyUpgrade(): Promise<void> {
  await resetPublicSchema()
  await m000.up(args)
  await m001.up(args)
  await seedOldVersionFixture()
  await m002.up(args)
  await m003.up(args)
  await seedM003CompatibilityFixture()
  await m004.up(args)
  await m005.up(args)
  await m006.up(args)
  await verifyM006Schema(true)
  await seedM006HistoryFixture()
  const m006HistoryBeforeM007 = await m006HistorySnapshot()
  const m006SchemaBeforeM007 = await m006SchemaSnapshot()
  await m007.up(args)
  await seedM007HistoryFixture()
  const m007HistoryBeforeM008 = await m007HistorySnapshot()
  const m007SchemaBeforeM008 = await m007SchemaSnapshot()
  await m008.up(args)
  await m009.up(args)
  await seedHistoricalMemberBeforeM010()
  await m010.up(args)
  await seedHistoricalIntakeBeforeM011()
  await m011.up(args)
  await m012.up(args)

  const { rows: versionRows } = await db.execute(sql`
    SELECT fv."schema", fv."schema_hash", ma."answers"
    FROM "form_versions" fv
    JOIN "membership_applications" ma ON ma."form_version_id" = fv."id"
    WHERE fv."id" = ${formVersionId}
  `)
  const row = versionRows[0] as {
    answers: Record<string, unknown>
    schema: unknown
    schema_hash: string
  }

  if (
    row.schema_hash !== hashFormSchema(row.schema) ||
    row.answers.fullName !== '迁移测试'
  ) {
    throw new Error(
      'M001→M002 upgrade changed history or produced a mismatched hash',
    )
  }

  await verifyReviewActionUniqueness()
  await verifyM003CompatibilityFixture()
  await verifyM009Schema(false, [
    'pendingActivation',
    'pendingClaim',
    'pendingApproval',
    'claimBlocked',
    'active',
    'disabled',
  ])
  await verifyM009LegacyAttribution()
  await verifyM009NullCheckConstraints()
  await verifyM009RecordVersionGuard()
  await verifyM009ConcurrentUniqueConflict()
  await verifyM010Schema(true)
  await verifyM011Schema(true)
  await verifyM012Schema()
  if (
    JSON.stringify(await m006HistorySnapshot()) !==
    JSON.stringify(m006HistoryBeforeM007)
  ) {
    throw new Error('M007 changed M006 association page history')
  }
  if (
    JSON.stringify(await m006SchemaSnapshot()) !==
    JSON.stringify(m006SchemaBeforeM007)
  ) {
    throw new Error('M007 changed M006 association page schema')
  }
  if (
    JSON.stringify(await m007HistorySnapshot()) !==
      JSON.stringify(m007HistoryBeforeM008) ||
    JSON.stringify(await m007SchemaSnapshot()) !==
      JSON.stringify(m007SchemaBeforeM008)
  ) {
    throw new Error('M008 changed M007 activity history or schema')
  }
  await verifyM003CompatibilityFixture()
}

async function verifyFresh(): Promise<void> {
  await resetPublicSchema()
  await m000.up(args)
  await m001.up(args)
  await m002.up(args)
  await m003.up(args)
  await m004.up(args)
  await m005.up(args)
  await m006.up(args)
  await m007.up(args)
  await m008.up(args)
  await m009.up(args)
  await m010.up(args)
  await m011.up(args)
  await m012.up(args)

  const { rows } = await db.execute(sql`
    SELECT "is_nullable"
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND "table_name" = 'form_versions'
      AND "column_name" = 'schema_hash'
  `)

  if (
    rows.length !== 1 ||
    (rows[0] as { is_nullable: string }).is_nullable !== 'NO'
  ) {
    throw new Error(
      'Fresh migration did not create the required schema_hash column',
    )
  }

  await verifyReviewActionUniqueness()
  await verifyM009Schema(true, [
    'pendingActivation',
    'pendingClaim',
    'pendingApproval',
    'claimBlocked',
    'active',
    'disabled',
  ])
  await verifyM009RecordVersionGuard()
  await verifyM010Schema(false)
  await verifyM011Schema(false)
  await verifyM012Schema()
}

async function verifyReviewActionUniqueness(): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT "indexdef"
    FROM "pg_indexes"
    WHERE "schemaname" = 'public'
      AND "indexname" = 'review_actions_application_idx'
  `)

  if (
    rows.length !== 1 ||
    !(rows[0] as { indexdef: string }).indexdef.includes('UNIQUE INDEX')
  ) {
    throw new Error(
      'Migration chain did not create the unique review action guard',
    )
  }
}

async function verifyM004FailureRollback(): Promise<void> {
  await resetPublicSchema()
  await m000.up(args)
  await m001.up(args)
  await m002.up(args)
  await m003.up(args)

  try {
    await db.transaction(async (transaction) => {
      await m004.up({
        ...args,
        db: transaction as MigrateUpArgs['db'],
      })
      throw new Error('intentional migration failure')
    })
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'intentional migration failure'
    )
      throw error
  }

  const { rows } = await db.execute(sql`
    SELECT
      to_regclass('public.announcements')::text AS "announcements",
      to_regclass('public._announcements_v')::text AS "versions",
      (
        SELECT COUNT(*)::integer
        FROM "information_schema"."columns"
        WHERE "table_schema" = 'public'
          AND "table_name" = 'audit_events'
          AND "column_name" = 'result'
      ) AS "audit_result_columns",
      (
        SELECT COUNT(*)::integer
        FROM "information_schema"."columns"
        WHERE "table_schema" = 'public'
          AND "table_name" = 'payload_locked_documents_rels'
          AND "column_name" = 'announcements_id'
      ) AS "locked_announcement_columns"
  `)
  const artifacts = rows[0] as {
    announcements: null | string
    audit_result_columns: number
    locked_announcement_columns: number
    versions: null | string
  }
  if (
    artifacts.announcements !== null ||
    artifacts.versions !== null ||
    artifacts.audit_result_columns !== 0 ||
    artifacts.locked_announcement_columns !== 0
  ) {
    throw new Error('Failed M004 left a partial schema change')
  }

  assertValues(
    await permissionEnumValues(),
    oldPermissionValues,
    'Failed M004 left partial permission enum values',
  )
}

async function verifyM005FailureRollback(): Promise<void> {
  await resetPublicSchema()
  await m000.up(args)
  await m001.up(args)
  await m002.up(args)
  await m003.up(args)
  await m004.up(args)

  try {
    await db.transaction(async (transaction) => {
      await m005.up({
        ...args,
        db: transaction as MigrateUpArgs['db'],
      })
      throw new Error('intentional M005 migration failure')
    })
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'intentional M005 migration failure'
    ) {
      throw error
    }
  }

  await verifyM004Schema()
}

async function verifyM006FailureRollback(): Promise<void> {
  await resetPublicSchema()
  await m000.up(args)
  await m001.up(args)
  await seedOldVersionFixture()
  await m002.up(args)
  await m003.up(args)
  await seedM003CompatibilityFixture()
  await m004.up(args)
  await m005.up(args)

  try {
    await db.transaction(async (transaction) => {
      await m006.up({
        ...args,
        db: transaction as MigrateUpArgs['db'],
      })
      throw new Error('intentional M006 migration failure')
    })
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'intentional M006 migration failure'
    ) {
      throw error
    }
  }

  const { rows } = await db.execute(sql`
    SELECT
      to_regclass('public.association_pages')::text AS "pages",
      to_regclass('public.association_pages_contacts')::text AS "contacts",
      to_regclass('public._association_pages_v')::text AS "versions",
      to_regclass('public._association_pages_v_version_contacts')::text
        AS "version_contacts",
      (
        SELECT COUNT(*)::integer
        FROM "information_schema"."columns"
        WHERE "table_schema" = 'public'
          AND "table_name" = 'payload_locked_documents_rels'
          AND "column_name" = 'association_pages_id'
      ) AS "locked_columns",
      (
        SELECT COUNT(*)::integer
        FROM "pg_type" enum_type
        JOIN "pg_namespace" namespace
          ON namespace."oid" = enum_type."typnamespace"
        WHERE namespace."nspname" = 'public'
          AND enum_type."typname" LIKE '%association_pages%'
      ) AS "enum_types"
  `)
  const artifacts = rows[0] as {
    contacts: null | string
    enum_types: number
    locked_columns: number
    pages: null | string
    version_contacts: null | string
    versions: null | string
  }
  if (
    artifacts.pages !== null ||
    artifacts.contacts !== null ||
    artifacts.versions !== null ||
    artifacts.version_contacts !== null ||
    artifacts.locked_columns !== 0 ||
    artifacts.enum_types !== 0
  ) {
    throw new Error(
      'Failed M006 transaction probe left a partial schema change',
    )
  }

  await verifyM005Schema()
  await verifyM003CompatibilityFixture()
}

async function verifyM007FailureRollback(): Promise<void> {
  await resetPublicSchema()
  await m000.up(args)
  await m001.up(args)
  await seedOldVersionFixture()
  await m002.up(args)
  await m003.up(args)
  await seedM003CompatibilityFixture()
  await m004.up(args)
  await m005.up(args)
  await m006.up(args)
  await seedM006HistoryFixture()
  const historyBefore = await m006HistorySnapshot()
  const schemaBefore = await m006SchemaSnapshot()

  try {
    await db.transaction(async (transaction) => {
      await m007.up({
        ...args,
        db: transaction as MigrateUpArgs['db'],
      })
      throw new Error('intentional M007 migration failure')
    })
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'intentional M007 migration failure'
    ) {
      throw error
    }
  }

  const { rows } = await db.execute(sql`
    SELECT
      to_regclass('public.activities')::text AS "activities",
      to_regclass('public._activities_v')::text AS "versions",
      (
        SELECT COUNT(*)::integer
        FROM "information_schema"."columns"
        WHERE "table_schema" = 'public'
          AND "table_name" = 'payload_locked_documents_rels'
          AND "column_name" = 'activities_id'
      ) AS "locked_columns",
      (
        SELECT COUNT(*)::integer
        FROM "pg_type" enum_type
        JOIN "pg_namespace" namespace
          ON namespace."oid" = enum_type."typnamespace"
        WHERE namespace."nspname" = 'public'
          AND enum_type."typname" LIKE '%activities%'
      ) AS "enum_types"
  `)
  const artifacts = rows[0] as {
    activities: null | string
    enum_types: number
    locked_columns: number
    versions: null | string
  }
  if (
    artifacts.activities !== null ||
    artifacts.versions !== null ||
    artifacts.locked_columns !== 0 ||
    artifacts.enum_types !== 0
  ) {
    throw new Error(
      'Failed M007 transaction probe left a partial schema change',
    )
  }

  if (
    JSON.stringify(await m006HistorySnapshot()) !==
    JSON.stringify(historyBefore)
  ) {
    throw new Error('Failed M007 transaction changed M006 history')
  }
  if (
    JSON.stringify(await m006SchemaSnapshot()) !== JSON.stringify(schemaBefore)
  ) {
    throw new Error('Failed M007 transaction changed M006 schema')
  }
  await verifyM006Schema(false)
  await verifyM003CompatibilityFixture()
}

async function verifyM008FailureRollback(): Promise<void> {
  await resetPublicSchema()
  await m000.up(args)
  await m001.up(args)
  await seedOldVersionFixture()
  await m002.up(args)
  await m003.up(args)
  await seedM003CompatibilityFixture()
  await m004.up(args)
  await m005.up(args)
  await m006.up(args)
  await seedM006HistoryFixture()
  await m007.up(args)
  await seedM007HistoryFixture()
  const historyBefore = await m007HistorySnapshot()
  const schemaBefore = await m007SchemaSnapshot()

  try {
    await db.transaction(async (transaction) => {
      await m008.up({ ...args, db: transaction as MigrateUpArgs['db'] })
      throw new Error('intentional M008 migration failure')
    })
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'intentional M008 migration failure'
    ) {
      throw error
    }
  }

  const { rows } = await db.execute(sql`
    SELECT
      to_regclass('public.news')::text AS "news",
      to_regclass('public._news_v')::text AS "versions",
      (
        SELECT COUNT(*)::integer
        FROM "information_schema"."columns"
        WHERE "table_schema" = 'public'
          AND "table_name" = 'payload_locked_documents_rels'
          AND "column_name" = 'news_id'
      ) AS "locked_columns",
      (
        SELECT COUNT(*)::integer
        FROM "pg_type" enum_type
        JOIN "pg_namespace" namespace ON namespace."oid" = enum_type."typnamespace"
        WHERE namespace."nspname" = 'public'
          AND enum_type."typname" LIKE '%news%'
      ) AS "enum_types"
  `)
  const artifacts = rows[0] as {
    enum_types: number
    locked_columns: number
    news: null | string
    versions: null | string
  }
  if (
    artifacts.news !== null ||
    artifacts.versions !== null ||
    artifacts.locked_columns !== 0 ||
    artifacts.enum_types !== 0
  ) {
    throw new Error('Failed M008 transaction left a partial schema change')
  }
  if (
    JSON.stringify(await m007HistorySnapshot()) !==
      JSON.stringify(historyBefore) ||
    JSON.stringify(await m007SchemaSnapshot()) !== JSON.stringify(schemaBefore)
  ) {
    throw new Error('Failed M008 transaction changed M007 history or schema')
  }
  await verifyM007Schema(false)
  await verifyM003CompatibilityFixture()
}

async function migrateThroughM008(): Promise<void> {
  await resetPublicSchema()
  await migrateFromAfter(-1, 8)
}

async function m009PreflightSnapshot(): Promise<unknown> {
  const { rows } = await db.execute(sql`
    SELECT jsonb_build_object(
      'users', (
        SELECT jsonb_agg(to_jsonb(auth_user) ORDER BY auth_user."id")
        FROM "auth_users" auth_user
      ),
      'overrides', (
        SELECT jsonb_agg(to_jsonb(permission_override) ORDER BY permission_override."id")
        FROM "permission_overrides" permission_override
      ),
      'newColumns', (
        SELECT COUNT(*)::integer
        FROM "information_schema"."columns"
        WHERE "table_schema" = 'public'
          AND (
            ("table_name" = 'auth_users' AND "column_name" IN (
              'account_type', 'student_number', 'status', 'default_role_expires_at',
              'temporary_credential_expires_at', 'record_version'
            ))
            OR
            ("table_name" = 'permission_overrides' AND "column_name" IN (
              'reason', 'granted_by_id', 'granted_at', 'revoked_by_id', 'revoked_at'
            ))
          )
      ),
      'newTypes', (
        SELECT COUNT(*)::integer
        FROM "pg_type" enum_type
        JOIN "pg_namespace" namespace ON namespace."oid" = enum_type."typnamespace"
        WHERE namespace."nspname" = 'public'
          AND enum_type."typname" IN (
            'enum_auth_users_account_type', 'enum_auth_users_status'
          )
      ),
      'newIndexes', (
        SELECT COUNT(*)::integer
        FROM "pg_indexes"
        WHERE "schemaname" = 'public'
          AND "indexname" IN (
            'auth_users_student_number_idx',
            'permission_overrides_active_global_idx',
            'permission_overrides_active_cycle_idx'
          )
      ),
      'newFunctions', (
        SELECT COUNT(*)::integer
        FROM "pg_proc" procedure
        JOIN "pg_namespace" namespace ON namespace."oid" = procedure."pronamespace"
        WHERE namespace."nspname" = 'public'
          AND procedure."proname" = 'm009_reject_auth_user_record_version_regression'
      ),
      'newTriggers', (
        SELECT COUNT(*)::integer
        FROM "pg_trigger" trigger
        JOIN "pg_class" relation ON relation."oid" = trigger."tgrelid"
        JOIN "pg_namespace" namespace ON namespace."oid" = relation."relnamespace"
        WHERE namespace."nspname" = 'public'
          AND relation."relname" = 'auth_users'
          AND trigger."tgname" = 'auth_users_record_version_no_regression'
          AND NOT trigger."tgisinternal"
      ),
      'permissions', (
        SELECT jsonb_agg(enum_value."enumlabel" ORDER BY enum_value."enumsortorder")
        FROM "pg_type" enum_type
        JOIN "pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"
        JOIN "pg_namespace" namespace ON namespace."oid" = enum_type."typnamespace"
        WHERE namespace."nspname" = 'public'
          AND enum_type."typname" = 'enum_permission_overrides_permission'
      )
    ) AS "snapshot"
  `)
  return (rows[0] as { snapshot: unknown }).snapshot
}

async function expectM009Failure(marker: string, code: string): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await m009.up({ ...args, db: transaction as MigrateUpArgs['db'] })
    })
  } catch (error) {
    if (matchesDatabaseError(error, { code, marker })) {
      return
    }
    throw error
  }
  throw new Error(`M009 unexpectedly accepted fixture requiring ${marker}`)
}

async function verifyM009InvalidUsernameFailure(): Promise<void> {
  await migrateThroughM008()
  await db.execute(sql`
    INSERT INTO "auth_users" (
      "id", "display_name", "username", "role", "salt", "hash"
    ) VALUES (
      ${m009UserIds.staff}, '虚构非法用户名账号', 'Invalid Legacy User',
      'staff', 'fictional-invalid-salt', 'fictional-invalid-hash'
    )
  `)
  const before = await m009PreflightSnapshot()
  await expectM009Failure('M009_INVALID_LEGACY_USERNAME', '23514')
  await verifyM009TriggerAbsent()
  if (
    JSON.stringify(await m009PreflightSnapshot()) !== JSON.stringify(before)
  ) {
    throw new Error(
      'Rejected M009 invalid-username upgrade changed data or schema',
    )
  }

  await db.execute(sql`
    UPDATE "auth_users" SET "username" = 'repaired-legacy-user'
    WHERE "id" = ${m009UserIds.staff}
  `)
  await m009.up(args)
  await verifyM009Schema(false)
}

async function verifyM009DuplicateGlobalFailure(): Promise<void> {
  await migrateThroughM008()
  await db.execute(sql`
    INSERT INTO "auth_users" ("id", "display_name", "username", "role")
    VALUES (${m009UserIds.staff}, '虚构全局重复账号', 'global-duplicate-user', 'staff')
  `)
  for (const overrideId of m009DuplicateOverrideIds) {
    await db.execute(sql`
      INSERT INTO "permission_overrides" (
        "id", "user_id", "permission", "effect", "scope_type"
      ) VALUES (
        ${overrideId}, ${m009UserIds.staff}, 'recruitment.application.read',
        'allow', 'global'
      )
    `)
  }
  const before = await m009PreflightSnapshot()
  await expectM009Failure('M009_DUPLICATE_ACTIVE_GLOBAL_OVERRIDE', '23505')
  await verifyM009TriggerAbsent()
  if (
    JSON.stringify(await m009PreflightSnapshot()) !== JSON.stringify(before)
  ) {
    throw new Error(
      'Rejected M009 duplicate-global upgrade changed data or schema',
    )
  }

  await db.execute(sql`
    DELETE FROM "permission_overrides" WHERE "id" = ${m009DuplicateOverrideIds[1]}
  `)
  await m009.up(args)
  await verifyM009Schema(false)
}

async function verifyM009DuplicateCycleFailure(): Promise<void> {
  await migrateThroughM008()
  await db.execute(sql`
    INSERT INTO "auth_users" ("id", "display_name", "username", "role")
    VALUES (${m009UserIds.staff}, '虚构周期重复账号', 'cycle-duplicate-user', 'staff')
  `)
  await db.execute(sql`
    INSERT INTO "recruitment_cycles" ("id", "code", "name", "status")
    VALUES (${cycleId}, 'm009-duplicate-cycle', '虚构重复周期', 'open')
  `)
  for (const overrideId of m009DuplicateOverrideIds) {
    await db.execute(sql`
      INSERT INTO "permission_overrides" (
        "id", "user_id", "permission", "effect", "scope_type", "recruitment_cycle_id"
      ) VALUES (
        ${overrideId}, ${m009UserIds.staff}, 'recruitment.application.read',
        'allow', 'recruitmentCycle', ${cycleId}
      )
    `)
  }
  const before = await m009PreflightSnapshot()
  await expectM009Failure('M009_DUPLICATE_ACTIVE_CYCLE_OVERRIDE', '23505')
  await verifyM009TriggerAbsent()
  if (
    JSON.stringify(await m009PreflightSnapshot()) !== JSON.stringify(before)
  ) {
    throw new Error(
      'Rejected M009 duplicate-cycle upgrade changed data or schema',
    )
  }

  await db.execute(sql`
    DELETE FROM "permission_overrides" WHERE "id" = ${m009DuplicateOverrideIds[1]}
  `)
  await m009.up(args)
  await verifyM009Schema(false)
}

async function seedM006HistoryFixture(): Promise<void> {
  const body = {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: '迁移探针正文',
              type: 'text',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }

  await db.execute(sql`
    INSERT INTO "association_pages" (
      "id", "page_key", "title", "body", "published_at", "created_by_id",
      "last_edited_by_id", "_status"
    ) VALUES (
      ${associationPageId}, 'contact', '迁移探针联系页', ${JSON.stringify(body)}::jsonb,
      '2026-07-16T00:00:00.000Z', ${userId}, ${userId}, 'published'
    )
  `)
  await db.execute(sql`
    INSERT INTO "association_pages_contacts" (
      "_order", "_parent_id", "id", "contact_id", "type", "label", "value",
      "note", "is_public", "show_on_home"
    ) VALUES (
      1, ${associationPageId}, 'migration-contact-row', ${associationContactId},
      'email', '迁移探针邮箱', 'fixture@example.test', '纯虚构数据', true, true
    )
  `)
  await db.execute(sql`
    INSERT INTO "_association_pages_v" (
      "id", "parent_id", "version_page_key", "version_title", "version_body",
      "version_published_at", "version_created_by_id", "version_last_edited_by_id",
      "version_updated_at", "version_created_at", "version__status", "latest"
    ) VALUES (
      ${associationVersionId}, ${associationPageId}, 'contact', '迁移探针联系页',
      ${JSON.stringify(body)}::jsonb, '2026-07-16T00:00:00.000Z', ${userId},
      ${userId}, '2026-07-16T00:00:00.000Z', '2026-07-16T00:00:00.000Z',
      'published', true
    )
  `)
  await db.execute(sql`
    INSERT INTO "_association_pages_v_version_contacts" (
      "_order", "_parent_id", "id", "contact_id", "type", "label", "value",
      "note", "is_public", "show_on_home", "_uuid"
    ) VALUES (
      1, ${associationVersionId}, ${associationVersionContactRowId},
      ${associationContactId}, 'email', '迁移探针邮箱', 'fixture@example.test',
      '纯虚构数据', true, true, 'migration-version-contact-row'
    )
  `)
}

async function m006HistorySnapshot(): Promise<unknown> {
  const { rows } = await db.execute(sql`
    SELECT jsonb_build_object(
      'page', (
        SELECT to_jsonb(page_row)
        FROM "association_pages" page_row
        WHERE page_row."id" = ${associationPageId}
      ),
      'contact', (
        SELECT to_jsonb(contact_row)
        FROM "association_pages_contacts" contact_row
        WHERE contact_row."_parent_id" = ${associationPageId}
      ),
      'version', (
        SELECT to_jsonb(version_row)
        FROM "_association_pages_v" version_row
        WHERE version_row."id" = ${associationVersionId}
      ),
      'versionContact', (
        SELECT to_jsonb(version_contact_row)
        FROM "_association_pages_v_version_contacts" version_contact_row
        WHERE version_contact_row."_parent_id" = ${associationVersionId}
      )
    ) AS "snapshot"
  `)
  return (rows[0] as { snapshot: unknown }).snapshot
}

async function m006SchemaSnapshot(): Promise<unknown> {
  const { rows } = await db.execute(sql`
    SELECT jsonb_build_object(
      'columns', (
        SELECT jsonb_agg(to_jsonb(column_row) ORDER BY column_row."table_name", column_row."ordinal_position")
        FROM (
          SELECT
            "table_name", "column_name", "ordinal_position", "column_default",
            "is_nullable", "data_type", "udt_name"
          FROM "information_schema"."columns"
          WHERE "table_schema" = 'public'
            AND (
              "table_name" IN (
                'association_pages', 'association_pages_contacts',
                '_association_pages_v', '_association_pages_v_version_contacts'
              )
              OR (
                "table_name" = 'payload_locked_documents_rels'
                AND "column_name" = 'association_pages_id'
              )
            )
        ) column_row
      ),
      'enums', (
        SELECT jsonb_agg(to_jsonb(enum_row) ORDER BY enum_row."type_name", enum_row."sort_order")
        FROM (
          SELECT
            enum_type."typname" AS "type_name",
            enum_value."enumlabel" AS "value",
            enum_value."enumsortorder" AS "sort_order"
          FROM "pg_type" enum_type
          JOIN "pg_enum" enum_value
            ON enum_value."enumtypid" = enum_type."oid"
          JOIN "pg_namespace" namespace
            ON namespace."oid" = enum_type."typnamespace"
          WHERE namespace."nspname" = 'public'
            AND enum_type."typname" IN (
              'enum_association_pages_contacts_type',
              'enum_association_pages_page_key',
              'enum_association_pages_status',
              'enum__association_pages_v_version_contacts_type',
              'enum__association_pages_v_version_page_key',
              'enum__association_pages_v_version_status'
            )
        ) enum_row
      ),
      'indexes', (
        SELECT jsonb_agg(to_jsonb(index_row) ORDER BY index_row."indexname")
        FROM (
          SELECT "tablename", "indexname", "indexdef"
          FROM "pg_indexes"
          WHERE "schemaname" = 'public'
            AND (
              "tablename" IN (
                'association_pages', 'association_pages_contacts',
                '_association_pages_v', '_association_pages_v_version_contacts'
              )
              OR "indexname" = 'payload_locked_documents_rels_association_pages_id_idx'
            )
        ) index_row
      ),
      'relations', (
        SELECT jsonb_agg(to_jsonb(relation_row) ORDER BY relation_row."name")
        FROM (
          SELECT
            constraint_row."conname" AS "name",
            constraint_row."conrelid"::regclass::text AS "table_name",
            pg_get_constraintdef(constraint_row."oid") AS "definition"
          FROM "pg_constraint" constraint_row
          WHERE constraint_row."contype" = 'f'
            AND (
              constraint_row."conrelid" IN (
                'association_pages'::regclass,
                'association_pages_contacts'::regclass,
                '_association_pages_v'::regclass,
                '_association_pages_v_version_contacts'::regclass
              )
              OR constraint_row."conname" = 'payload_locked_documents_rels_association_pages_fk'
            )
        ) relation_row
      )
    ) AS "snapshot"
  `)

  return (rows[0] as { snapshot: unknown }).snapshot
}

async function seedM007HistoryFixture(): Promise<void> {
  const body = {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: '虚构迁移活动正文',
              type: 'text',
              version: 1,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }

  await db.execute(sql`
    INSERT INTO "activities" (
      "id", "activity_type", "title", "summary", "slug", "location",
      "starts_at", "ends_at", "is_cancelled", "cancellation_note", "body",
      "published_at", "history_sort_at", "created_by_id", "last_edited_by_id", "_status"
    ) VALUES (
      ${activityId}, 'temporary', '虚构迁移活动', '只用于迁移验证',
      'migration-activity-00000000', '虚构校园广场',
      '2026-08-01T12:00:00.000Z', '2026-08-01T14:00:00.000Z', true,
      '因虚构原因取消', ${JSON.stringify(body)}::jsonb,
      '2026-07-16T08:00:00.000Z', '2026-08-01T14:00:00.000Z',
      ${userId}, ${userId}, 'published'
    )
  `)
  await db.execute(sql`
    INSERT INTO "_activities_v" (
      "id", "parent_id", "version_activity_type", "version_title",
      "version_summary", "version_slug", "version_location", "version_starts_at",
      "version_ends_at", "version_is_cancelled", "version_cancellation_note",
      "version_body", "version_published_at", "version_history_sort_at",
      "version_created_by_id",
      "version_last_edited_by_id", "version_updated_at", "version_created_at",
      "version__status", "latest"
    ) VALUES (
      ${activityVersionId}, ${activityId}, 'temporary', '虚构迁移活动',
      '只用于迁移验证', 'migration-activity-00000000', '虚构校园广场',
      '2026-08-01T12:00:00.000Z', '2026-08-01T14:00:00.000Z', true,
      '因虚构原因取消', ${JSON.stringify(body)}::jsonb,
      '2026-07-16T08:00:00.000Z', '2026-08-01T14:00:00.000Z',
      ${userId}, ${userId},
      '2026-07-16T08:00:00.000Z', '2026-07-16T08:00:00.000Z', 'published', true
    )
  `)
}

async function m007HistorySnapshot(): Promise<unknown> {
  const { rows } = await db.execute(sql`
    SELECT jsonb_build_object(
      'activity', (
        SELECT to_jsonb(activity_row)
        FROM "activities" activity_row
        WHERE activity_row."id" = ${activityId}
      ),
      'version', (
        SELECT to_jsonb(version_row)
        FROM "_activities_v" version_row
        WHERE version_row."id" = ${activityVersionId}
      )
    ) AS "snapshot"
  `)
  return (rows[0] as { snapshot: unknown }).snapshot
}

async function m007SchemaSnapshot(): Promise<unknown> {
  const { rows } = await db.execute(sql`
    SELECT jsonb_build_object(
      'columns', (
        SELECT jsonb_agg(to_jsonb(column_row) ORDER BY column_row."table_name", column_row."ordinal_position")
        FROM (
          SELECT
            "table_name", "column_name", "ordinal_position", "column_default",
            "is_nullable", "data_type", "udt_name"
          FROM "information_schema"."columns"
          WHERE "table_schema" = 'public'
            AND (
              "table_name" IN ('activities', '_activities_v')
              OR (
                "table_name" = 'payload_locked_documents_rels'
                AND "column_name" = 'activities_id'
              )
            )
        ) column_row
      ),
      'enums', (
        SELECT jsonb_agg(to_jsonb(enum_row) ORDER BY enum_row."type_name", enum_row."sort_order")
        FROM (
          SELECT
            enum_type."typname" AS "type_name",
            enum_value."enumlabel" AS "value",
            enum_value."enumsortorder" AS "sort_order"
          FROM "pg_type" enum_type
          JOIN "pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"
          JOIN "pg_namespace" namespace ON namespace."oid" = enum_type."typnamespace"
          WHERE namespace."nspname" = 'public'
            AND enum_type."typname" IN (
              'enum_activities_activity_type',
              'enum_activities_status',
              'enum__activities_v_version_activity_type',
              'enum__activities_v_version_status'
            )
        ) enum_row
      ),
      'indexes', (
        SELECT jsonb_agg(to_jsonb(index_row) ORDER BY index_row."indexname")
        FROM (
          SELECT "tablename", "indexname", "indexdef"
          FROM "pg_indexes"
          WHERE "schemaname" = 'public'
            AND (
              "tablename" IN ('activities', '_activities_v')
              OR "indexname" = 'payload_locked_documents_rels_activities_id_idx'
            )
        ) index_row
      ),
      'relations', (
        SELECT jsonb_agg(to_jsonb(relation_row) ORDER BY relation_row."name")
        FROM (
          SELECT
            constraint_row."conname" AS "name",
            constraint_row."conrelid"::regclass::text AS "table_name",
            pg_get_constraintdef(constraint_row."oid") AS "definition"
          FROM "pg_constraint" constraint_row
          WHERE constraint_row."contype" = 'f'
            AND (
              constraint_row."conrelid" IN (
                'activities'::regclass, '_activities_v'::regclass
              )
              OR constraint_row."conname" = 'payload_locked_documents_rels_activities_fk'
            )
        ) relation_row
      )
    ) AS "snapshot"
  `)
  return (rows[0] as { snapshot: unknown }).snapshot
}

async function seedM008HistoryFixture(): Promise<void> {
  const body = {
    root: {
      children: [
        {
          children: [{ format: 0, text: '虚构迁移新闻正文', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'root',
    },
  }
  await db.execute(sql`
    INSERT INTO "news" (
      "id", "title", "summary", "slug", "body", "published_at",
      "created_by_id", "last_edited_by_id", "_status"
    ) VALUES (
      ${newsId}, '虚构迁移新闻', '只用于迁移验证', 'migration-news-fixture',
      ${JSON.stringify(body)}::jsonb, '2026-07-19T06:00:00.000Z',
      ${userId}, ${userId}, 'published'
    )
  `)
  await db.execute(sql`
    INSERT INTO "_news_v" (
      "id", "parent_id", "version_title", "version_summary", "version_slug",
      "version_body", "version_published_at", "version_created_by_id",
      "version_last_edited_by_id", "version_updated_at", "version_created_at",
      "version__status", "latest"
    ) VALUES (
      ${newsVersionId}, ${newsId}, '虚构迁移新闻', '只用于迁移验证',
      'migration-news-fixture', ${JSON.stringify(body)}::jsonb,
      '2026-07-19T06:00:00.000Z', ${userId}, ${userId},
      '2026-07-19T06:00:00.000Z', '2026-07-19T06:00:00.000Z',
      'published', true
    )
  `)
}

async function m008HistorySnapshot(): Promise<unknown> {
  const { rows } = await db.execute(sql`
    SELECT jsonb_build_object(
      'news', (SELECT to_jsonb(row) FROM "news" row WHERE row."id" = ${newsId}),
      'version', (
        SELECT to_jsonb(row) FROM "_news_v" row WHERE row."id" = ${newsVersionId}
      )
    ) AS "snapshot"
  `)
  return (rows[0] as { snapshot: unknown }).snapshot
}

async function expectDownDisabled(
  name: string,
  down: (migrationArgs: MigrateDownArgs) => Promise<void>,
): Promise<void> {
  try {
    await down(args)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(name) &&
      error.message.includes('disabled')
    ) {
      return
    }
    throw error
  }
  throw new Error(`${name} down unexpectedly succeeded`)
}

async function m009DownSnapshot(): Promise<unknown> {
  const { rows } = await db.execute(sql`
    SELECT jsonb_build_object(
      'users', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row."id") FROM "auth_users" row),
      'overrides', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row."id") FROM "permission_overrides" row
      ),
      'columns', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row."table_name", row."ordinal_position")
        FROM (
          SELECT "table_name", "column_name", "ordinal_position", "column_default",
            "is_nullable", "data_type", "udt_name"
          FROM "information_schema"."columns"
          WHERE "table_schema" = 'public'
            AND "table_name" IN ('auth_users', 'permission_overrides')
        ) row
      ),
      'constraints', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row."name")
        FROM (
          SELECT "conname" AS "name", "contype" AS "type",
            pg_get_constraintdef("oid") AS "definition"
          FROM "pg_constraint"
          WHERE "conrelid" IN ('auth_users'::regclass, 'permission_overrides'::regclass)
        ) row
      ),
      'indexes', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row."indexname")
        FROM (
          SELECT "tablename", "indexname", "indexdef"
          FROM "pg_indexes"
          WHERE "schemaname" = 'public'
            AND "tablename" IN ('auth_users', 'permission_overrides')
        ) row
      ),
      'enums', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row."type_name", row."sort_order")
        FROM (
          SELECT enum_type."typname" AS "type_name", enum_value."enumlabel" AS "value",
            enum_value."enumsortorder" AS "sort_order"
          FROM "pg_type" enum_type
          JOIN "pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"
          JOIN "pg_namespace" namespace ON namespace."oid" = enum_type."typnamespace"
          WHERE namespace."nspname" = 'public'
            AND enum_type."typname" IN (
              'enum_permission_overrides_permission',
              'enum_auth_users_account_type',
              'enum_auth_users_status'
            )
        ) row
      ),
      'functions', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row."schema", row."name")
        FROM (
          SELECT namespace."nspname" AS "schema", procedure."proname" AS "name",
            procedure."pronargs"::integer AS "argument_count",
            pg_get_functiondef(procedure."oid") AS "definition"
          FROM "pg_proc" procedure
          JOIN "pg_namespace" namespace ON namespace."oid" = procedure."pronamespace"
          WHERE namespace."nspname" = 'public'
            AND procedure."proname" = 'm009_reject_auth_user_record_version_regression'
        ) row
      ),
      'triggers', (
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row."name")
        FROM (
          SELECT trigger."tgname" AS "name", trigger."tgtype"::integer AS "type_bits",
            trigger."tgenabled" AS "enabled", pg_get_triggerdef(trigger."oid") AS "definition"
          FROM "pg_trigger" trigger
          JOIN "pg_class" relation ON relation."oid" = trigger."tgrelid"
          JOIN "pg_namespace" namespace ON namespace."oid" = relation."relnamespace"
          WHERE namespace."nspname" = 'public'
            AND relation."relname" = 'auth_users'
            AND trigger."tgname" = 'auth_users_record_version_no_regression'
            AND NOT trigger."tgisinternal"
        ) row
      )
    ) AS "snapshot"
  `)
  return (rows[0] as { snapshot: unknown }).snapshot
}

async function expectM009DownRejected(): Promise<void> {
  try {
    await m009.down(args)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('M009_DOWN_UNSUPPORTED') &&
      error.message.includes('forward-only')
    ) {
      return
    }
    throw error
  }
  throw new Error('M009 down unexpectedly succeeded')
}

async function m010DownSnapshot(): Promise<unknown> {
  const { rows } = await db.execute(sql`
    SELECT jsonb_build_object(
      'member_columns', (
        SELECT jsonb_agg("column_name" ORDER BY "column_name")
        FROM "information_schema"."columns"
        WHERE "table_schema" = 'public' AND "table_name" = 'members'
      ),
      'claim_tables', (
        SELECT jsonb_agg("table_name" ORDER BY "table_name")
        FROM "information_schema"."tables"
        WHERE "table_schema" = 'public'
          AND "table_name" IN ('account_claims', 'member_intake_applications')
      ),
      'role_values', (
        SELECT jsonb_agg(enum_value."enumlabel" ORDER BY enum_value."enumsortorder")
        FROM "pg_type" enum_type
        JOIN "pg_enum" enum_value ON enum_value."enumtypid" = enum_type."oid"
        WHERE enum_type."typname" = 'enum_auth_users_role'
      )
    ) AS "snapshot"
  `)
  return (rows[0] as { snapshot: unknown }).snapshot
}

async function expectM010DownRejected(): Promise<void> {
  try {
    await m010.down(args)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('M010_DOWN_UNSUPPORTED') &&
      error.message.includes('forward-only')
    ) {
      return
    }
    throw error
  }
  throw new Error('M010 down unexpectedly succeeded')
}

async function expectM011DownRejected(): Promise<void> {
  try {
    await m011.down(args)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('M011_DOWN_UNSUPPORTED') &&
      error.message.includes('forward-only')
    ) {
      return
    }
    throw error
  }
  throw new Error('M011 down unexpectedly succeeded')
}

async function expectM012DownRejected(): Promise<void> {
  try {
    await m012.down(args)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('M012_DOWN_UNSUPPORTED') &&
      error.message.includes('forward-only')
    ) {
      return
    }
    throw error
  }
  throw new Error('M012 down unexpectedly succeeded')
}

async function verifyM012FailureRollback(): Promise<void> {
  await resetPublicSchema()
  for (const migration of [
    m000,
    m001,
    m002,
    m003,
    m004,
    m005,
    m006,
    m007,
    m008,
    m009,
    m010,
    m011,
  ]) {
    await migration.up(args)
  }
  try {
    await db.transaction(async (transaction) => {
      await m012.up({ ...args, db: transaction as MigrateUpArgs['db'] })
      throw new Error('intentional M012 migration failure')
    })
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'intentional M012 migration failure'
    ) {
      throw error
    }
  }
  const { rows } = await db.execute(sql`
    SELECT
      to_regclass('public.media_assets')::text AS media,
      to_regclass('public.gallery_works')::text AS gallery,
      to_regclass('public._gallery_works_v')::text AS versions,
      (SELECT count(*)::integer FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'payload_locked_documents_rels'
         AND column_name IN ('media_assets_id', 'gallery_works_id')) AS locked_columns,
      (SELECT count(*)::integer FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname LIKE '%gallery_works%') AS enum_types
  `)
  const artifacts = rows[0] as Record<string, unknown>
  if (
    artifacts.media !== null ||
    artifacts.gallery !== null ||
    artifacts.versions !== null ||
    artifacts.locked_columns !== 0 ||
    artifacts.enum_types !== 0
  ) {
    throw new Error('Failed M012 transaction left a partial schema change')
  }
}

async function verifyDisabledDownMigrations(): Promise<void> {
  await resetPublicSchema()
  await m000.up(args)
  await m001.up(args)
  await seedOldVersionFixture()
  await m002.up(args)
  await m003.up(args)
  await seedM003CompatibilityFixture()
  await m004.up(args)
  await expectDownDisabled('M004', m004.down)
  await verifyM004Schema()
  await verifyM003CompatibilityFixture()

  await m005.up(args)
  await expectDownDisabled('M005', m005.down)
  await verifyM005Schema()
  await verifyM003CompatibilityFixture()

  await m006.up(args)
  await seedM006HistoryFixture()
  const beforeDown = await m006HistorySnapshot()
  const schemaBeforeDown = await m006SchemaSnapshot()
  await expectDownDisabled('M006', m006.down)
  await verifyM006Schema(false)
  const afterDown = await m006HistorySnapshot()
  const schemaAfterDown = await m006SchemaSnapshot()
  if (JSON.stringify(afterDown) !== JSON.stringify(beforeDown)) {
    throw new Error('Rejected M006 down changed association page history')
  }
  if (JSON.stringify(schemaAfterDown) !== JSON.stringify(schemaBeforeDown)) {
    throw new Error('Rejected M006 down changed association page schema')
  }
  await verifyM003CompatibilityFixture()

  await m007.up(args)
  await seedM007HistoryFixture()
  const activityBeforeDown = await m007HistorySnapshot()
  const activitySchemaBeforeDown = await m007SchemaSnapshot()
  const associationBeforeM007Down = await m006HistorySnapshot()
  const associationSchemaBeforeM007Down = await m006SchemaSnapshot()
  await expectDownDisabled('M007', m007.down)
  await verifyM007Schema(false)
  if (
    JSON.stringify(await m007HistorySnapshot()) !==
    JSON.stringify(activityBeforeDown)
  ) {
    throw new Error('Rejected M007 down changed activity history')
  }
  if (
    JSON.stringify(await m007SchemaSnapshot()) !==
    JSON.stringify(activitySchemaBeforeDown)
  ) {
    throw new Error('Rejected M007 down changed activity schema')
  }
  if (
    JSON.stringify(await m006HistorySnapshot()) !==
      JSON.stringify(associationBeforeM007Down) ||
    JSON.stringify(await m006SchemaSnapshot()) !==
      JSON.stringify(associationSchemaBeforeM007Down)
  ) {
    throw new Error('Rejected M007 down changed M006 history or schema')
  }

  await m008.up(args)
  await seedM008HistoryFixture()
  const newsBeforeDown = await m008HistorySnapshot()
  const activityBeforeM008Down = await m007HistorySnapshot()
  const activitySchemaBeforeM008Down = await m007SchemaSnapshot()
  await expectDownDisabled('M008', m008.down)
  await verifyM008Schema(false)
  if (
    JSON.stringify(await m008HistorySnapshot()) !==
    JSON.stringify(newsBeforeDown)
  ) {
    throw new Error('Rejected M008 down changed News history')
  }
  if (
    JSON.stringify(await m007HistorySnapshot()) !==
      JSON.stringify(activityBeforeM008Down) ||
    JSON.stringify(await m007SchemaSnapshot()) !==
      JSON.stringify(activitySchemaBeforeM008Down)
  ) {
    throw new Error('Rejected M008 down changed M007 history or schema')
  }
  await verifyM003CompatibilityFixture()

  await m009.up(args)
  const identityBeforeDown = await m009DownSnapshot()
  await expectM009DownRejected()
  if (
    JSON.stringify(await m009DownSnapshot()) !==
    JSON.stringify(identityBeforeDown)
  ) {
    throw new Error('Rejected M009 down changed identity data or schema')
  }
  await verifyM009Schema(false)
  await verifyM009LegacyAttribution()
  await verifyM009NullCheckConstraints()

  await m010.up(args)
  const membershipBeforeDown = await m010DownSnapshot()
  await expectM010DownRejected()
  if (
    JSON.stringify(await m010DownSnapshot()) !==
    JSON.stringify(membershipBeforeDown)
  ) {
    throw new Error('Rejected M010 down changed membership data or schema')
  }
  await verifyM010Schema(false)
  await m011.up(args)
  await expectM011DownRejected()
  await verifyM011Schema(false)
  await m012.up(args)
  await expectM012DownRejected()
  await verifyM012Schema()
}

try {
  await verifyUpgrade()
  await verifyFresh()
  await verifyM004FailureRollback()
  await verifyM005FailureRollback()
  await verifyM006FailureRollback()
  await verifyM007FailureRollback()
  await verifyM008FailureRollback()
  await verifyM012FailureRollback()
  await verifyRepresentativeM009Upgrades()
  await verifyM009InvalidUsernameFailure()
  await verifyM009DuplicateGlobalFailure()
  await verifyM009DuplicateCycleFailure()
  await verifyDisabledDownMigrations()
  payload.logger.info(
    'Migration probe passed through M012: upgrade, fresh, Media/Gallery append-only schema, rollback, and disabled-down checks',
  )
} finally {
  await resetPublicSchema()
}

process.exit(0)
