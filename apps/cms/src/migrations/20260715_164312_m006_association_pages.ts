import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_association_pages_contacts_type" AS ENUM('email', 'phone', 'qq', 'wechat', 'other');
  CREATE TYPE "public"."enum_association_pages_page_key" AS ENUM('home', 'about', 'contact');
  CREATE TYPE "public"."enum_association_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__association_pages_v_version_contacts_type" AS ENUM('email', 'phone', 'qq', 'wechat', 'other');
  CREATE TYPE "public"."enum__association_pages_v_version_page_key" AS ENUM('home', 'about', 'contact');
  CREATE TYPE "public"."enum__association_pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "association_pages_contacts" (
    "_order" integer NOT NULL,
    "_parent_id" uuid NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "contact_id" varchar,
    "type" "enum_association_pages_contacts_type",
    "label" varchar,
    "value" varchar,
    "note" varchar,
    "is_public" boolean DEFAULT false,
    "show_on_home" boolean DEFAULT false
  );

  CREATE TABLE "association_pages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "page_key" "enum_association_pages_page_key",
    "title" varchar,
    "seo_summary" varchar,
    "lead" varchar,
    "body" jsonb,
    "published_at" timestamp(3) with time zone,
    "created_by_id" uuid,
    "last_edited_by_id" uuid,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_association_pages_status" DEFAULT 'draft'
  );

  CREATE TABLE "_association_pages_v_version_contacts" (
    "_order" integer NOT NULL,
    "_parent_id" uuid NOT NULL,
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "contact_id" varchar,
    "type" "enum__association_pages_v_version_contacts_type",
    "label" varchar,
    "value" varchar,
    "note" varchar,
    "is_public" boolean DEFAULT false,
    "show_on_home" boolean DEFAULT false,
    "_uuid" varchar
  );

  CREATE TABLE "_association_pages_v" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "parent_id" uuid,
    "version_page_key" "enum__association_pages_v_version_page_key",
    "version_title" varchar,
    "version_seo_summary" varchar,
    "version_lead" varchar,
    "version_body" jsonb,
    "version_published_at" timestamp(3) with time zone,
    "version_created_by_id" uuid,
    "version_last_edited_by_id" uuid,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__association_pages_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "association_pages_id" uuid;
  ALTER TABLE "association_pages_contacts" ADD CONSTRAINT "association_pages_contacts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."association_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "association_pages" ADD CONSTRAINT "association_pages_created_by_id_auth_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "association_pages" ADD CONSTRAINT "association_pages_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_association_pages_v_version_contacts" ADD CONSTRAINT "_association_pages_v_version_contacts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_association_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_association_pages_v" ADD CONSTRAINT "_association_pages_v_parent_id_association_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."association_pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_association_pages_v" ADD CONSTRAINT "_association_pages_v_version_created_by_id_auth_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_association_pages_v" ADD CONSTRAINT "_association_pages_v_version_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "association_pages_contacts_order_idx" ON "association_pages_contacts" USING btree ("_order");
  CREATE INDEX "association_pages_contacts_parent_id_idx" ON "association_pages_contacts" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "association_pages_page_key_idx" ON "association_pages" USING btree ("page_key");
  CREATE INDEX "association_pages_published_at_idx" ON "association_pages" USING btree ("published_at");
  CREATE INDEX "association_pages_created_by_idx" ON "association_pages" USING btree ("created_by_id");
  CREATE INDEX "association_pages_last_edited_by_idx" ON "association_pages" USING btree ("last_edited_by_id");
  CREATE INDEX "association_pages_updated_at_idx" ON "association_pages" USING btree ("updated_at");
  CREATE INDEX "association_pages_created_at_idx" ON "association_pages" USING btree ("created_at");
  CREATE INDEX "association_pages__status_idx" ON "association_pages" USING btree ("_status");
  CREATE INDEX "_association_pages_v_version_contacts_order_idx" ON "_association_pages_v_version_contacts" USING btree ("_order");
  CREATE INDEX "_association_pages_v_version_contacts_parent_id_idx" ON "_association_pages_v_version_contacts" USING btree ("_parent_id");
  CREATE INDEX "_association_pages_v_parent_idx" ON "_association_pages_v" USING btree ("parent_id");
  CREATE INDEX "_association_pages_v_version_version_page_key_idx" ON "_association_pages_v" USING btree ("version_page_key");
  CREATE INDEX "_association_pages_v_version_version_published_at_idx" ON "_association_pages_v" USING btree ("version_published_at");
  CREATE INDEX "_association_pages_v_version_version_created_by_idx" ON "_association_pages_v" USING btree ("version_created_by_id");
  CREATE INDEX "_association_pages_v_version_version_last_edited_by_idx" ON "_association_pages_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "_association_pages_v_version_version_updated_at_idx" ON "_association_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_association_pages_v_version_version_created_at_idx" ON "_association_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_association_pages_v_version_version__status_idx" ON "_association_pages_v" USING btree ("version__status");
  CREATE INDEX "_association_pages_v_created_at_idx" ON "_association_pages_v" USING btree ("created_at");
  CREATE INDEX "_association_pages_v_updated_at_idx" ON "_association_pages_v" USING btree ("updated_at");
  CREATE INDEX "_association_pages_v_latest_idx" ON "_association_pages_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_association_pages_fk" FOREIGN KEY ("association_pages_id") REFERENCES "public"."association_pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_association_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("association_pages_id");`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M006 down is disabled because it would destroy association pages and versions. Apply a forward migration instead.',
  )
}
