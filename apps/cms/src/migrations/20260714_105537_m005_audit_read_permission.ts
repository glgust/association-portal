import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_permission_overrides_permission"
      ADD VALUE 'audit.read';
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M005 down is disabled: removing audit.read would invalidate permission overrides and authorization semantics. Apply a forward migration instead.',
  )
}
