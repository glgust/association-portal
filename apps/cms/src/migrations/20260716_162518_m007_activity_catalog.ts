import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_activities_activity_type" AS ENUM('temporary', 'standing');
  CREATE TYPE "public"."enum_activities_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__activities_v_version_activity_type" AS ENUM('temporary', 'standing');
  CREATE TYPE "public"."enum__activities_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "activities" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "activity_type" "enum_activities_activity_type",
    "title" varchar,
    "summary" varchar,
    "slug" varchar,
    "location" varchar,
    "starts_at" timestamp(3) with time zone,
    "ends_at" timestamp(3) with time zone,
    "schedule_text" varchar,
    "is_cancelled" boolean DEFAULT false,
    "cancellation_note" varchar,
    "body" jsonb,
    "published_at" timestamp(3) with time zone,
    "history_sort_at" timestamp(3) with time zone,
    "created_by_id" uuid,
    "last_edited_by_id" uuid,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_activities_status" DEFAULT 'draft'
  );

  CREATE TABLE "_activities_v" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "parent_id" uuid,
    "version_activity_type" "enum__activities_v_version_activity_type",
    "version_title" varchar,
    "version_summary" varchar,
    "version_slug" varchar,
    "version_location" varchar,
    "version_starts_at" timestamp(3) with time zone,
    "version_ends_at" timestamp(3) with time zone,
    "version_schedule_text" varchar,
    "version_is_cancelled" boolean DEFAULT false,
    "version_cancellation_note" varchar,
    "version_body" jsonb,
    "version_published_at" timestamp(3) with time zone,
    "version_history_sort_at" timestamp(3) with time zone,
    "version_created_by_id" uuid,
    "version_last_edited_by_id" uuid,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__activities_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "activities_id" uuid;
  ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_id_auth_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activities" ADD CONSTRAINT "activities_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_activities_v" ADD CONSTRAINT "_activities_v_parent_id_activities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_activities_v" ADD CONSTRAINT "_activities_v_version_created_by_id_auth_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_activities_v" ADD CONSTRAINT "_activities_v_version_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "activities_slug_idx" ON "activities" USING btree ("slug");
  CREATE INDEX "activities_published_at_idx" ON "activities" USING btree ("published_at");
  CREATE INDEX "activities_history_sort_at_idx" ON "activities" USING btree ("history_sort_at");
  CREATE INDEX "activities_created_by_idx" ON "activities" USING btree ("created_by_id");
  CREATE INDEX "activities_last_edited_by_idx" ON "activities" USING btree ("last_edited_by_id");
  CREATE INDEX "activities_updated_at_idx" ON "activities" USING btree ("updated_at");
  CREATE INDEX "activities_created_at_idx" ON "activities" USING btree ("created_at");
  CREATE INDEX "activities__status_idx" ON "activities" USING btree ("_status");
  CREATE INDEX "_activities_v_parent_idx" ON "_activities_v" USING btree ("parent_id");
  CREATE INDEX "_activities_v_version_version_slug_idx" ON "_activities_v" USING btree ("version_slug");
  CREATE INDEX "_activities_v_version_version_published_at_idx" ON "_activities_v" USING btree ("version_published_at");
  CREATE INDEX "_activities_v_version_version_history_sort_at_idx" ON "_activities_v" USING btree ("version_history_sort_at");
  CREATE INDEX "_activities_v_version_version_created_by_idx" ON "_activities_v" USING btree ("version_created_by_id");
  CREATE INDEX "_activities_v_version_version_last_edited_by_idx" ON "_activities_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "_activities_v_version_version_updated_at_idx" ON "_activities_v" USING btree ("version_updated_at");
  CREATE INDEX "_activities_v_version_version_created_at_idx" ON "_activities_v" USING btree ("version_created_at");
  CREATE INDEX "_activities_v_version_version__status_idx" ON "_activities_v" USING btree ("version__status");
  CREATE INDEX "_activities_v_created_at_idx" ON "_activities_v" USING btree ("created_at");
  CREATE INDEX "_activities_v_updated_at_idx" ON "_activities_v" USING btree ("updated_at");
  CREATE INDEX "_activities_v_latest_idx" ON "_activities_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_activities_fk" FOREIGN KEY ("activities_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_activities_id_idx" ON "payload_locked_documents_rels" USING btree ("activities_id");`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M007 activity catalog down is disabled; use a forward migration instead',
  )
}
