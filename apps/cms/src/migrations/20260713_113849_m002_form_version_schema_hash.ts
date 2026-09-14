import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { createHash } from 'node:crypto'

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`
}

function schemaHash(schema: unknown): string {
  return createHash('sha256').update(canonicalJson(schema)).digest('hex')
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "form_versions" ADD COLUMN "schema_hash" varchar;
  `)

  const { rows } = await db.execute(
    sql`SELECT "id", "schema" FROM "form_versions"`,
  )

  for (const row of rows as Array<{ id: string; schema: unknown }>) {
    await db.execute(
      sql`UPDATE "form_versions" SET "schema_hash" = ${schemaHash(row.schema)} WHERE "id" = ${row.id}`,
    )
  }

  await db.execute(sql`
  ALTER TABLE "form_versions" ALTER COLUMN "schema_hash" SET NOT NULL;
  CREATE INDEX "form_versions_schema_hash_idx" ON "form_versions" USING btree ("schema_hash");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "form_versions_schema_hash_idx";
  ALTER TABLE "form_versions" DROP COLUMN "schema_hash";`)
}
