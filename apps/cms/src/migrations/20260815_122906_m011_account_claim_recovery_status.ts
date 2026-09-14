import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "account_claims" ADD COLUMN "public_message" varchar;
  ALTER TABLE "account_claims" ADD COLUMN "public_message_updated_at" timestamp(3) with time zone;
  ALTER TABLE "account_claims" ADD COLUMN "public_message_updated_by_id" uuid;
  ALTER TABLE "account_claims" ADD COLUMN "status_access_version" numeric;
  ALTER TABLE "account_claims" ADD COLUMN "status_access_issued_at" timestamp(3) with time zone;
  ALTER TABLE "account_claims" ADD COLUMN "converted_at" timestamp(3) with time zone;
  ALTER TABLE "account_claims" ADD COLUMN "converted_account_version" numeric;
  ALTER TABLE "account_claims" ADD COLUMN "conversion_withdrawn_at" timestamp(3) with time zone;
  ALTER TABLE "account_claims" ADD COLUMN "conversion_withdrawn_by_id" uuid;
  ALTER TABLE "member_intake_applications" ADD COLUMN "public_message" varchar;
  ALTER TABLE "member_intake_applications" ADD COLUMN "public_message_updated_at" timestamp(3) with time zone;
  ALTER TABLE "member_intake_applications" ADD COLUMN "public_message_updated_by_id" uuid;
  ALTER TABLE "member_intake_applications" ADD COLUMN "status_access_version" numeric;
  ALTER TABLE "member_intake_applications" ADD COLUMN "status_access_issued_at" timestamp(3) with time zone;

  UPDATE "account_claims" SET "status_access_version" = 1 WHERE "status_access_version" IS NULL;
  UPDATE "member_intake_applications" SET "status_access_version" = 1 WHERE "status_access_version" IS NULL;
  ALTER TABLE "account_claims" ALTER COLUMN "status_access_version" SET DEFAULT 1;
  ALTER TABLE "account_claims" ALTER COLUMN "status_access_version" SET NOT NULL;
  ALTER TABLE "member_intake_applications" ALTER COLUMN "status_access_version" SET DEFAULT 1;
  ALTER TABLE "member_intake_applications" ALTER COLUMN "status_access_version" SET NOT NULL;
  ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_status_access_version_positive" CHECK ("status_access_version" >= 1);
  ALTER TABLE "member_intake_applications" ADD CONSTRAINT "member_intake_applications_status_access_version_positive" CHECK ("status_access_version" >= 1);
  ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_public_message_updated_by_id_auth_users_id_fk" FOREIGN KEY ("public_message_updated_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_conversion_withdrawn_by_id_auth_users_id_fk" FOREIGN KEY ("conversion_withdrawn_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "member_intake_applications" ADD CONSTRAINT "member_intake_applications_public_message_updated_by_id_auth_users_id_fk" FOREIGN KEY ("public_message_updated_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "account_claims_public_message_updated_by_idx" ON "account_claims" USING btree ("public_message_updated_by_id");
  CREATE INDEX "account_claims_conversion_withdrawn_by_idx" ON "account_claims" USING btree ("conversion_withdrawn_by_id");
  CREATE INDEX "member_intake_applications_public_message_updated_by_idx" ON "member_intake_applications" USING btree ("public_message_updated_by_id");`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M011_DOWN_UNSUPPORTED: account-claim recovery and public status data are forward-only',
  )
}
