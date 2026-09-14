import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_news_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__news_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "news" (
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
	    "_status" "enum_news_status" DEFAULT 'draft'
  );

  CREATE TABLE "_news_v" (
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
	    "version__status" "enum__news_v_version_status" DEFAULT 'draft',
	    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	    "latest" boolean
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "news_id" uuid;
  ALTER TABLE "news" ADD CONSTRAINT "news_created_by_id_auth_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "news" ADD CONSTRAINT "news_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_news_v" ADD CONSTRAINT "_news_v_parent_id_news_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."news"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_news_v" ADD CONSTRAINT "_news_v_version_created_by_id_auth_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_news_v" ADD CONSTRAINT "_news_v_version_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "news_slug_idx" ON "news" USING btree ("slug");
  CREATE INDEX "news_published_at_idx" ON "news" USING btree ("published_at");
  CREATE INDEX "news_created_by_idx" ON "news" USING btree ("created_by_id");
  CREATE INDEX "news_last_edited_by_idx" ON "news" USING btree ("last_edited_by_id");
  CREATE INDEX "news_updated_at_idx" ON "news" USING btree ("updated_at");
  CREATE INDEX "news_created_at_idx" ON "news" USING btree ("created_at");
  CREATE INDEX "news__status_idx" ON "news" USING btree ("_status");
  CREATE INDEX "_news_v_parent_idx" ON "_news_v" USING btree ("parent_id");
  CREATE INDEX "_news_v_version_version_slug_idx" ON "_news_v" USING btree ("version_slug");
  CREATE INDEX "_news_v_version_version_published_at_idx" ON "_news_v" USING btree ("version_published_at");
  CREATE INDEX "_news_v_version_version_created_by_idx" ON "_news_v" USING btree ("version_created_by_id");
  CREATE INDEX "_news_v_version_version_last_edited_by_idx" ON "_news_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "_news_v_version_version_updated_at_idx" ON "_news_v" USING btree ("version_updated_at");
  CREATE INDEX "_news_v_version_version_created_at_idx" ON "_news_v" USING btree ("version_created_at");
  CREATE INDEX "_news_v_version_version__status_idx" ON "_news_v" USING btree ("version__status");
  CREATE INDEX "_news_v_created_at_idx" ON "_news_v" USING btree ("created_at");
  CREATE INDEX "_news_v_updated_at_idx" ON "_news_v" USING btree ("updated_at");
  CREATE INDEX "_news_v_latest_idx" ON "_news_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_news_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_news_id_idx" ON "payload_locked_documents_rels" USING btree ("news_id");`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M008 News publication down is disabled; use a forward migration instead',
  )
}
