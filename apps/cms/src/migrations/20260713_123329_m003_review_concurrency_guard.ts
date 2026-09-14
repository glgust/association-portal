import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "review_actions_application_idx";
  CREATE UNIQUE INDEX "review_actions_application_idx" ON "review_actions" USING btree ("application_id");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "review_actions_application_idx";
  CREATE INDEX "review_actions_application_idx" ON "review_actions" USING btree ("application_id");`)
}
