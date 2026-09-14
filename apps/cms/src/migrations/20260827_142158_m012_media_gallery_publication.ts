import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_gallery_works_recognizable_people" AS ENUM('none', 'consentConfirmed');
  CREATE TYPE "public"."enum_gallery_works_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__gallery_works_v_version_recognizable_people" AS ENUM('none', 'consentConfirmed');
  CREATE TYPE "public"."enum__gallery_works_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "gallery_works" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"summary" varchar,
  	"slug" varchar,
  	"media_id" uuid,
  	"alt_text" varchar,
  	"author_id" uuid,
  	"pen_name" varchar,
  	"public_author_name" varchar,
  	"display_rights_confirmed" boolean DEFAULT false,
  	"recognizable_people" "enum_gallery_works_recognizable_people",
  	"published_at" timestamp(3) with time zone,
  	"created_by_id" uuid,
  	"last_edited_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_gallery_works_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_gallery_works_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_summary" varchar,
  	"version_slug" varchar,
  	"version_media_id" uuid,
  	"version_alt_text" varchar,
  	"version_author_id" uuid,
  	"version_pen_name" varchar,
  	"version_public_author_name" varchar,
  	"version_display_rights_confirmed" boolean DEFAULT false,
  	"version_recognizable_people" "enum__gallery_works_v_version_recognizable_people",
  	"version_published_at" timestamp(3) with time zone,
  	"version_created_by_id" uuid,
  	"version_last_edited_by_id" uuid,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__gallery_works_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "media_assets" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"object_prefix" varchar NOT NULL,
  	"sha256" varchar NOT NULL,
  	"mime_type" varchar NOT NULL,
  	"width" numeric NOT NULL,
  	"height" numeric NOT NULL,
  	"byte_size" numeric NOT NULL,
  	"display_object_key" varchar NOT NULL,
  	"display_sha256" varchar NOT NULL,
  	"display_mime_type" varchar NOT NULL,
  	"display_width" numeric NOT NULL,
  	"display_height" numeric NOT NULL,
  	"display_byte_size" numeric NOT NULL,
  	"detail_object_key" varchar NOT NULL,
  	"detail_sha256" varchar NOT NULL,
  	"detail_mime_type" varchar NOT NULL,
  	"detail_width" numeric NOT NULL,
  	"detail_height" numeric NOT NULL,
  	"detail_byte_size" numeric NOT NULL,
  	"list_object_key" varchar NOT NULL,
  	"list_sha256" varchar NOT NULL,
  	"list_mime_type" varchar NOT NULL,
  	"list_width" numeric NOT NULL,
  	"list_height" numeric NOT NULL,
  	"list_byte_size" numeric NOT NULL,
  	"thumbnail_object_key" varchar NOT NULL,
  	"thumbnail_sha256" varchar NOT NULL,
  	"thumbnail_mime_type" varchar NOT NULL,
  	"thumbnail_width" numeric NOT NULL,
  	"thumbnail_height" numeric NOT NULL,
  	"thumbnail_byte_size" numeric NOT NULL,
  	"created_by_id" uuid NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "gallery_works_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_assets_id" uuid;
  ALTER TABLE "gallery_works" ADD CONSTRAINT "gallery_works_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "gallery_works" ADD CONSTRAINT "gallery_works_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "gallery_works" ADD CONSTRAINT "gallery_works_created_by_id_auth_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "gallery_works" ADD CONSTRAINT "gallery_works_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "_gallery_works_v" ADD CONSTRAINT "_gallery_works_v_parent_id_gallery_works_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gallery_works"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "_gallery_works_v" ADD CONSTRAINT "_gallery_works_v_version_media_id_media_assets_id_fk" FOREIGN KEY ("version_media_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "_gallery_works_v" ADD CONSTRAINT "_gallery_works_v_version_author_id_auth_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "_gallery_works_v" ADD CONSTRAINT "_gallery_works_v_version_created_by_id_auth_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "_gallery_works_v" ADD CONSTRAINT "_gallery_works_v_version_last_edited_by_id_auth_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_id_auth_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
  CREATE UNIQUE INDEX "gallery_works_slug_idx" ON "gallery_works" USING btree ("slug");
  CREATE INDEX "gallery_works_media_idx" ON "gallery_works" USING btree ("media_id");
  CREATE INDEX "gallery_works_author_idx" ON "gallery_works" USING btree ("author_id");
  CREATE INDEX "gallery_works_published_at_idx" ON "gallery_works" USING btree ("published_at");
  CREATE INDEX "gallery_works_created_by_idx" ON "gallery_works" USING btree ("created_by_id");
  CREATE INDEX "gallery_works_last_edited_by_idx" ON "gallery_works" USING btree ("last_edited_by_id");
  CREATE INDEX "gallery_works_updated_at_idx" ON "gallery_works" USING btree ("updated_at");
  CREATE INDEX "gallery_works_created_at_idx" ON "gallery_works" USING btree ("created_at");
  CREATE INDEX "gallery_works__status_idx" ON "gallery_works" USING btree ("_status");
  CREATE INDEX "_gallery_works_v_parent_idx" ON "_gallery_works_v" USING btree ("parent_id");
  CREATE INDEX "_gallery_works_v_version_version_slug_idx" ON "_gallery_works_v" USING btree ("version_slug");
  CREATE INDEX "_gallery_works_v_version_version_media_idx" ON "_gallery_works_v" USING btree ("version_media_id");
  CREATE INDEX "_gallery_works_v_version_version_author_idx" ON "_gallery_works_v" USING btree ("version_author_id");
  CREATE INDEX "_gallery_works_v_version_version_published_at_idx" ON "_gallery_works_v" USING btree ("version_published_at");
  CREATE INDEX "_gallery_works_v_version_version_created_by_idx" ON "_gallery_works_v" USING btree ("version_created_by_id");
  CREATE INDEX "_gallery_works_v_version_version_last_edited_by_idx" ON "_gallery_works_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "_gallery_works_v_version_version_updated_at_idx" ON "_gallery_works_v" USING btree ("version_updated_at");
  CREATE INDEX "_gallery_works_v_version_version_created_at_idx" ON "_gallery_works_v" USING btree ("version_created_at");
  CREATE INDEX "_gallery_works_v_version_version__status_idx" ON "_gallery_works_v" USING btree ("version__status");
  CREATE INDEX "_gallery_works_v_created_at_idx" ON "_gallery_works_v" USING btree ("created_at");
  CREATE INDEX "_gallery_works_v_updated_at_idx" ON "_gallery_works_v" USING btree ("updated_at");
  CREATE INDEX "_gallery_works_v_latest_idx" ON "_gallery_works_v" USING btree ("latest");
  CREATE UNIQUE INDEX "media_assets_object_prefix_idx" ON "media_assets" USING btree ("object_prefix");
  CREATE INDEX "media_assets_created_by_idx" ON "media_assets" USING btree ("created_by_id");
  CREATE INDEX "media_assets_updated_at_idx" ON "media_assets" USING btree ("updated_at");
  CREATE INDEX "media_assets_created_at_idx" ON "media_assets" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_gallery_works_fk" FOREIGN KEY ("gallery_works_id") REFERENCES "public"."gallery_works"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_gallery_works_id_idx" ON "payload_locked_documents_rels" USING btree ("gallery_works_id");
  CREATE INDEX "payload_locked_documents_rels_media_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("media_assets_id");`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M012_DOWN_UNSUPPORTED: media and gallery publication data are forward-only',
  )
}
