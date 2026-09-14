import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_announcements_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__announcements_v_version_status" AS ENUM('draft', 'published');
  ALTER TYPE "public"."enum_permission_overrides_permission" ADD VALUE 'content.create';
  ALTER TYPE "public"."enum_permission_overrides_permission" ADD VALUE 'content.edit';
  ALTER TYPE "public"."enum_permission_overrides_permission" ADD VALUE 'content.directPublish';
  CREATE TABLE "announcements" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "title" varchar,
    "summary" varchar,
    "slug" varchar,
    "body" jsonb,
    "published_at" timestamp(3) with time zone,
    "created_by_id" uuid,
    "last_edited_by_id" uuid,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_announcements_status" DEFAULT 'draft'
  );

  CREATE TABLE "_announcements_v" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "parent_id" uuid,
    "version_title" varchar,
    "version_summary" varchar,
    "version_slug" varchar,
    "version_body" jsonb,
    "version_published_at" timestamp(3) with time zone,
    "version_created_by_id" uuid,
    "version_last_edited_by_id" uuid,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__announcements_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  ALTER TABLE "audit_events" ADD COLUMN "result" varchar;
  UPDATE "audit_events" SET "result" = 'success' WHERE "result" IS NULL;
  ALTER TABLE "audit_events" ALTER COLUMN "result" SET NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "announcements_id" uuid;
  ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_auth_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "announcements" ADD CONSTRAINT "announcements_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_announcements_v" ADD CONSTRAINT "_announcements_v_parent_id_announcements_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."announcements"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_announcements_v" ADD CONSTRAINT "_announcements_v_version_created_by_id_auth_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_announcements_v" ADD CONSTRAINT "_announcements_v_version_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "announcements_slug_idx" ON "announcements" USING btree ("slug");
  CREATE INDEX "announcements_published_at_idx" ON "announcements" USING btree ("published_at");
  CREATE INDEX "announcements_created_by_idx" ON "announcements" USING btree ("created_by_id");
  CREATE INDEX "announcements_last_edited_by_idx" ON "announcements" USING btree ("last_edited_by_id");
  CREATE INDEX "announcements_updated_at_idx" ON "announcements" USING btree ("updated_at");
  CREATE INDEX "announcements_created_at_idx" ON "announcements" USING btree ("created_at");
  CREATE INDEX "announcements__status_idx" ON "announcements" USING btree ("_status");
  CREATE INDEX "_announcements_v_parent_idx" ON "_announcements_v" USING btree ("parent_id");
  CREATE INDEX "_announcements_v_version_version_slug_idx" ON "_announcements_v" USING btree ("version_slug");
  CREATE INDEX "_announcements_v_version_version_published_at_idx" ON "_announcements_v" USING btree ("version_published_at");
  CREATE INDEX "_announcements_v_version_version_created_by_idx" ON "_announcements_v" USING btree ("version_created_by_id");
  CREATE INDEX "_announcements_v_version_version_last_edited_by_idx" ON "_announcements_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "_announcements_v_version_version_updated_at_idx" ON "_announcements_v" USING btree ("version_updated_at");
  CREATE INDEX "_announcements_v_version_version_created_at_idx" ON "_announcements_v" USING btree ("version_created_at");
  CREATE INDEX "_announcements_v_version_version__status_idx" ON "_announcements_v" USING btree ("version__status");
  CREATE INDEX "_announcements_v_created_at_idx" ON "_announcements_v" USING btree ("created_at");
  CREATE INDEX "_announcements_v_updated_at_idx" ON "_announcements_v" USING btree ("updated_at");
  CREATE INDEX "_announcements_v_latest_idx" ON "_announcements_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_announcements_fk" FOREIGN KEY ("announcements_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_announcements_id_idx" ON "payload_locked_documents_rels" USING btree ("announcements_id");`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M004 down migration is disabled because it would destroy announcements and content permission overrides. Apply a forward migration instead.',
  )
}
