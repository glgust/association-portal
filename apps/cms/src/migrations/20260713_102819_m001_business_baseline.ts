import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_auth_users_role" AS ENUM('staff', 'cadre', 'admin', 'owner');
  CREATE TYPE "public"."enum_recruitment_cycles_status" AS ENUM('draft', 'open', 'closed', 'archived');
  CREATE TYPE "public"."enum_form_versions_status" AS ENUM('published', 'retired');
  CREATE TYPE "public"."enum_membership_applications_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TYPE "public"."enum_review_actions_action" AS ENUM('approve', 'reject');
  CREATE TYPE "public"."enum_permission_overrides_permission" AS ENUM('recruitment.application.read', 'recruitment.application.review', 'recruitment.form.manage');
  CREATE TYPE "public"."enum_permission_overrides_effect" AS ENUM('allow', 'deny');
  CREATE TYPE "public"."enum_permission_overrides_scope_type" AS ENUM('global', 'recruitmentCycle');
  CREATE TABLE "recruitment_cycles" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"status" "enum_recruitment_cycles_status" DEFAULT 'draft' NOT NULL,
  	"opens_at" timestamp(3) with time zone,
  	"closes_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "form_definitions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"recruitment_cycle_id" uuid NOT NULL,
  	"name" varchar NOT NULL,
  	"draft_schema" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "form_versions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"form_definition_id" uuid NOT NULL,
  	"recruitment_cycle_id" uuid NOT NULL,
  	"version" numeric NOT NULL,
  	"status" "enum_form_versions_status" DEFAULT 'published' NOT NULL,
  	"schema" jsonb NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "membership_applications" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"recruitment_cycle_id" uuid NOT NULL,
  	"form_version_id" uuid NOT NULL,
  	"status" "enum_membership_applications_status" DEFAULT 'pending' NOT NULL,
  	"answers" jsonb NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"record_version" numeric DEFAULT 1 NOT NULL,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "members" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"student_number" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"source_application_id" uuid NOT NULL,
  	"confirmed_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "review_actions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"application_id" uuid NOT NULL,
  	"reviewer_id" uuid NOT NULL,
  	"action" "enum_review_actions_action" NOT NULL,
  	"comment" varchar,
  	"acted_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audit_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"actor_id" uuid,
  	"action" varchar NOT NULL,
  	"target_type" varchar NOT NULL,
  	"target_id" varchar NOT NULL,
  	"request_id" varchar NOT NULL,
  	"metadata" jsonb,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "permission_overrides" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"permission" "enum_permission_overrides_permission" NOT NULL,
  	"effect" "enum_permission_overrides_effect" NOT NULL,
  	"scope_type" "enum_permission_overrides_scope_type" NOT NULL,
  	"recruitment_cycle_id" uuid,
  	"expires_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "auth_users" ADD COLUMN "role" "enum_auth_users_role" DEFAULT 'staff' NOT NULL;
  ALTER TABLE "auth_users" ADD COLUMN "access_expires_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "recruitment_cycles_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_definitions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_versions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "membership_applications_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "members_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "review_actions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audit_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "permission_overrides_id" uuid;
  ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_recruitment_cycle_id_recruitment_cycles_id_fk" FOREIGN KEY ("recruitment_cycle_id") REFERENCES "public"."recruitment_cycles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_definition_id_form_definitions_id_fk" FOREIGN KEY ("form_definition_id") REFERENCES "public"."form_definitions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_recruitment_cycle_id_recruitment_cycles_id_fk" FOREIGN KEY ("recruitment_cycle_id") REFERENCES "public"."recruitment_cycles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_recruitment_cycle_id_recruitment_cycles_id_fk" FOREIGN KEY ("recruitment_cycle_id") REFERENCES "public"."recruitment_cycles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_form_version_id_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."form_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "members" ADD CONSTRAINT "members_source_application_id_membership_applications_id_fk" FOREIGN KEY ("source_application_id") REFERENCES "public"."membership_applications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_application_id_membership_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."membership_applications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_reviewer_id_auth_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_auth_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_recruitment_cycle_id_recruitment_cycles_id_fk" FOREIGN KEY ("recruitment_cycle_id") REFERENCES "public"."recruitment_cycles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_scope_consistency" CHECK (
    ("scope_type" = 'global' AND "recruitment_cycle_id" IS NULL)
    OR
    ("scope_type" = 'recruitmentCycle' AND "recruitment_cycle_id" IS NOT NULL)
  );
  CREATE UNIQUE INDEX "recruitment_cycles_code_idx" ON "recruitment_cycles" USING btree ("code");
  CREATE INDEX "recruitment_cycles_updated_at_idx" ON "recruitment_cycles" USING btree ("updated_at");
  CREATE INDEX "recruitment_cycles_created_at_idx" ON "recruitment_cycles" USING btree ("created_at");
  CREATE INDEX "form_definitions_recruitment_cycle_idx" ON "form_definitions" USING btree ("recruitment_cycle_id");
  CREATE INDEX "form_definitions_updated_at_idx" ON "form_definitions" USING btree ("updated_at");
  CREATE INDEX "form_definitions_created_at_idx" ON "form_definitions" USING btree ("created_at");
  CREATE INDEX "form_versions_form_definition_idx" ON "form_versions" USING btree ("form_definition_id");
  CREATE INDEX "form_versions_recruitment_cycle_idx" ON "form_versions" USING btree ("recruitment_cycle_id");
  CREATE INDEX "form_versions_updated_at_idx" ON "form_versions" USING btree ("updated_at");
  CREATE INDEX "form_versions_created_at_idx" ON "form_versions" USING btree ("created_at");
  CREATE UNIQUE INDEX "formDefinition_version_idx" ON "form_versions" USING btree ("form_definition_id","version");
  CREATE INDEX "membership_applications_recruitment_cycle_idx" ON "membership_applications" USING btree ("recruitment_cycle_id");
  CREATE INDEX "membership_applications_form_version_idx" ON "membership_applications" USING btree ("form_version_id");
  CREATE INDEX "membership_applications_status_idx" ON "membership_applications" USING btree ("status");
  CREATE UNIQUE INDEX "membership_applications_idempotency_key_idx" ON "membership_applications" USING btree ("idempotency_key");
  CREATE INDEX "membership_applications_updated_at_idx" ON "membership_applications" USING btree ("updated_at");
  CREATE INDEX "membership_applications_created_at_idx" ON "membership_applications" USING btree ("created_at");
  CREATE UNIQUE INDEX "members_student_number_idx" ON "members" USING btree ("student_number");
  CREATE UNIQUE INDEX "members_source_application_idx" ON "members" USING btree ("source_application_id");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE INDEX "review_actions_application_idx" ON "review_actions" USING btree ("application_id");
  CREATE INDEX "review_actions_reviewer_idx" ON "review_actions" USING btree ("reviewer_id");
  CREATE INDEX "review_actions_updated_at_idx" ON "review_actions" USING btree ("updated_at");
  CREATE INDEX "review_actions_created_at_idx" ON "review_actions" USING btree ("created_at");
  CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");
  CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");
  CREATE INDEX "audit_events_target_id_idx" ON "audit_events" USING btree ("target_id");
  CREATE INDEX "audit_events_request_id_idx" ON "audit_events" USING btree ("request_id");
  CREATE INDEX "audit_events_updated_at_idx" ON "audit_events" USING btree ("updated_at");
  CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");
  CREATE INDEX "permission_overrides_user_idx" ON "permission_overrides" USING btree ("user_id");
  CREATE INDEX "permission_overrides_recruitment_cycle_idx" ON "permission_overrides" USING btree ("recruitment_cycle_id");
  CREATE INDEX "permission_overrides_updated_at_idx" ON "permission_overrides" USING btree ("updated_at");
  CREATE INDEX "permission_overrides_created_at_idx" ON "permission_overrides" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_recruitment_cycles_fk" FOREIGN KEY ("recruitment_cycles_id") REFERENCES "public"."recruitment_cycles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_definitions_fk" FOREIGN KEY ("form_definitions_id") REFERENCES "public"."form_definitions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_versions_fk" FOREIGN KEY ("form_versions_id") REFERENCES "public"."form_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_membership_applications_fk" FOREIGN KEY ("membership_applications_id") REFERENCES "public"."membership_applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_review_actions_fk" FOREIGN KEY ("review_actions_id") REFERENCES "public"."review_actions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_events_fk" FOREIGN KEY ("audit_events_id") REFERENCES "public"."audit_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_permission_overrides_fk" FOREIGN KEY ("permission_overrides_id") REFERENCES "public"."permission_overrides"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_recruitment_cycles_id_idx" ON "payload_locked_documents_rels" USING btree ("recruitment_cycles_id");
  CREATE INDEX "payload_locked_documents_rels_form_definitions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_definitions_id");
  CREATE INDEX "payload_locked_documents_rels_form_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_versions_id");
  CREATE INDEX "payload_locked_documents_rels_membership_applications_id_idx" ON "payload_locked_documents_rels" USING btree ("membership_applications_id");
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_locked_documents_rels_review_actions_id_idx" ON "payload_locked_documents_rels" USING btree ("review_actions_id");
  CREATE INDEX "payload_locked_documents_rels_audit_events_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_events_id");
  CREATE INDEX "payload_locked_documents_rels_permission_overrides_id_idx" ON "payload_locked_documents_rels" USING btree ("permission_overrides_id");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "recruitment_cycles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_definitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "form_versions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "membership_applications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "review_actions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audit_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "permission_overrides" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "permission_overrides" DROP CONSTRAINT "permission_overrides_scope_consistency";
  DROP TABLE "recruitment_cycles" CASCADE;
  DROP TABLE "form_definitions" CASCADE;
  DROP TABLE "form_versions" CASCADE;
  DROP TABLE "membership_applications" CASCADE;
  DROP TABLE "members" CASCADE;
  DROP TABLE "review_actions" CASCADE;
  DROP TABLE "audit_events" CASCADE;
  DROP TABLE "permission_overrides" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_recruitment_cycles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_definitions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_versions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_membership_applications_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_members_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_review_actions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audit_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_permission_overrides_fk";
  
  DROP INDEX "payload_locked_documents_rels_recruitment_cycles_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_definitions_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_versions_id_idx";
  DROP INDEX "payload_locked_documents_rels_membership_applications_id_idx";
  DROP INDEX "payload_locked_documents_rels_members_id_idx";
  DROP INDEX "payload_locked_documents_rels_review_actions_id_idx";
  DROP INDEX "payload_locked_documents_rels_audit_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_permission_overrides_id_idx";
  ALTER TABLE "auth_users" DROP COLUMN "role";
  ALTER TABLE "auth_users" DROP COLUMN "access_expires_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "recruitment_cycles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_definitions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_versions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "membership_applications_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "members_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "review_actions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audit_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "permission_overrides_id";
  DROP TYPE "public"."enum_auth_users_role";
  DROP TYPE "public"."enum_recruitment_cycles_status";
  DROP TYPE "public"."enum_form_versions_status";
  DROP TYPE "public"."enum_membership_applications_status";
  DROP TYPE "public"."enum_review_actions_action";
  DROP TYPE "public"."enum_permission_overrides_permission";
  DROP TYPE "public"."enum_permission_overrides_effect";
  DROP TYPE "public"."enum_permission_overrides_scope_type";`)
}
