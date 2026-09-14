import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_auth_users_role" ADD VALUE IF NOT EXISTS 'member' BEFORE 'staff';
    ALTER TYPE "public"."enum_auth_users_status" ADD VALUE IF NOT EXISTS 'pendingClaim' BEFORE 'active';
    ALTER TYPE "public"."enum_auth_users_status" ADD VALUE IF NOT EXISTS 'pendingApproval' BEFORE 'active';
    ALTER TYPE "public"."enum_auth_users_status" ADD VALUE IF NOT EXISTS 'claimBlocked' BEFORE 'active';

    CREATE TYPE "public"."enum_members_membership_identity" AS ENUM('member', 'staff', 'cadre');
    CREATE TYPE "public"."enum_members_contacts_type" AS ENUM('phone', 'wechat', 'qq', 'other');
    CREATE TYPE "public"."enum_members_source" AS ENUM('offlineInterview', 'manualVerification');
    CREATE TYPE "public"."enum_account_claims_status" AS ENUM('pendingReview', 'approved', 'rejected');
    CREATE TYPE "public"."enum_account_claims_applicant_identity" AS ENUM('member', 'staff', 'cadre');
    CREATE TYPE "public"."enum_account_claims_contacts_type" AS ENUM('phone', 'wechat', 'qq', 'other');
    CREATE TYPE "public"."enum_account_claims_rejection_reason" AS ENUM(
      'identityMismatch', 'duplicateOrExistingAccount', 'insufficientEvidence',
      'policyOrEligibility', 'applicantRequest', 'other'
    );
    CREATE TYPE "public"."enum_member_intake_applications_status" AS ENUM('pendingReview', 'approved', 'rejected');
    CREATE TYPE "public"."enum_member_intake_applications_applicant_identity" AS ENUM('member', 'staff', 'cadre');
    CREATE TYPE "public"."enum_member_intake_applications_contacts_type" AS ENUM('phone', 'wechat', 'qq', 'other');
    CREATE TYPE "public"."enum_member_intake_applications_rejection_reason" AS ENUM(
      'identityMismatch', 'duplicateOrExistingAccount', 'insufficientEvidence',
      'policyOrEligibility', 'applicantRequest', 'other'
    );

    ALTER TABLE "members" ALTER COLUMN "student_number" DROP NOT NULL;
    ALTER TABLE "members" ALTER COLUMN "source_application_id" DROP NOT NULL;
    ALTER TABLE "members" ADD COLUMN "membership_identity" "enum_members_membership_identity";
    ALTER TABLE "members" ADD COLUMN "major" varchar;
    ALTER TABLE "members" ADD COLUMN "source" "enum_members_source";
    ALTER TABLE "members" ADD COLUMN "auth_user_id" uuid;
    ALTER TABLE "members" ADD COLUMN "record_version" numeric;

    CREATE TABLE "members_contacts" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "type" "enum_members_contacts_type" NOT NULL,
      "label" varchar,
      "value" varchar NOT NULL,
      "is_primary" boolean DEFAULT false NOT NULL
    );

    CREATE TABLE "account_claims" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "member_id" uuid NOT NULL,
      "auth_user_id" uuid NOT NULL,
      "status" "enum_account_claims_status" DEFAULT 'pendingReview' NOT NULL,
      "applicant_identity" "enum_account_claims_applicant_identity" NOT NULL,
      "major" varchar,
      "idempotency_key" varchar NOT NULL,
      "request_fingerprint" varchar NOT NULL,
      "submitted_auth_user_version" numeric NOT NULL,
      "authorization_summary" jsonb NOT NULL,
      "submitted_at" timestamp(3) with time zone NOT NULL,
      "reviewed_at" timestamp(3) with time zone,
      "reviewed_by_id" uuid,
      "rejection_reason" "enum_account_claims_rejection_reason",
      "request_id" varchar NOT NULL,
      "record_version" numeric DEFAULT 1 NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "account_claims_contacts" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "type" "enum_account_claims_contacts_type" NOT NULL,
      "label" varchar,
      "value" varchar NOT NULL,
      "is_primary" boolean DEFAULT false NOT NULL
    );

    CREATE TABLE "member_intake_applications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "status" "enum_member_intake_applications_status" DEFAULT 'pendingReview' NOT NULL,
      "name" varchar,
      "student_number" varchar,
      "applicant_identity" "enum_member_intake_applications_applicant_identity" NOT NULL,
      "major" varchar,
      "privacy_purpose_confirmed" boolean DEFAULT false,
      "member_id" uuid,
      "idempotency_key" varchar NOT NULL,
      "request_fingerprint" varchar NOT NULL,
      "submitted_at" timestamp(3) with time zone NOT NULL,
      "reviewed_at" timestamp(3) with time zone,
      "reviewed_by_id" uuid,
      "rejection_reason" "enum_member_intake_applications_rejection_reason",
      "request_id" varchar NOT NULL,
      "record_version" numeric DEFAULT 1 NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "member_intake_applications_contacts" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "type" "enum_member_intake_applications_contacts_type" NOT NULL,
      "label" varchar,
      "value" varchar NOT NULL,
      "is_primary" boolean DEFAULT false NOT NULL
    );

    UPDATE "members" SET "record_version" = 1 WHERE "record_version" IS NULL;
    ALTER TABLE "members" ALTER COLUMN "record_version" SET DEFAULT 1;
    ALTER TABLE "members" ALTER COLUMN "record_version" SET NOT NULL;

    ALTER TABLE "members" ADD CONSTRAINT "members_record_version_positive" CHECK ("record_version" >= 1);
    ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_versions_positive" CHECK (
      "record_version" >= 1 AND "submitted_auth_user_version" >= 1
    );
    ALTER TABLE "member_intake_applications" ADD CONSTRAINT "member_intake_applications_record_version_positive" CHECK ("record_version" >= 1);
    ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_review_shape" CHECK (
      ("status" = 'pendingReview' AND "reviewed_at" IS NULL AND "reviewed_by_id" IS NULL AND "rejection_reason" IS NULL)
      OR ("status" = 'approved' AND "reviewed_at" IS NOT NULL AND "reviewed_by_id" IS NOT NULL AND "rejection_reason" IS NULL AND "major" IS NULL)
      OR ("status" = 'rejected' AND "reviewed_at" IS NOT NULL AND "reviewed_by_id" IS NOT NULL AND "rejection_reason" IS NOT NULL AND "major" IS NULL)
    );
    ALTER TABLE "member_intake_applications" ADD CONSTRAINT "member_intake_applications_review_shape" CHECK (
      ("status" = 'pendingReview' AND "name" IS NOT NULL AND "privacy_purpose_confirmed" = true AND "reviewed_at" IS NULL AND "reviewed_by_id" IS NULL AND "rejection_reason" IS NULL)
      OR ("status" = 'approved' AND "name" IS NULL AND "student_number" IS NULL AND "major" IS NULL AND "reviewed_at" IS NOT NULL AND "reviewed_by_id" IS NOT NULL AND "rejection_reason" IS NULL)
      OR ("status" = 'rejected' AND "name" IS NULL AND "student_number" IS NULL AND "major" IS NULL AND "reviewed_at" IS NOT NULL AND "reviewed_by_id" IS NOT NULL AND "rejection_reason" IS NOT NULL)
    );

    ALTER TABLE "members_contacts" ADD CONSTRAINT "members_contacts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "members" ADD CONSTRAINT "members_auth_user_id_auth_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "account_claims_contacts" ADD CONSTRAINT "account_claims_contacts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."account_claims"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_auth_user_id_auth_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_reviewed_by_id_auth_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "member_intake_applications_contacts" ADD CONSTRAINT "member_intake_applications_contacts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."member_intake_applications"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "member_intake_applications" ADD CONSTRAINT "member_intake_applications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "member_intake_applications" ADD CONSTRAINT "member_intake_applications_reviewed_by_id_auth_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;

    CREATE INDEX "members_contacts_order_idx" ON "members_contacts" USING btree ("_order");
    CREATE INDEX "members_contacts_parent_id_idx" ON "members_contacts" USING btree ("_parent_id");
    CREATE UNIQUE INDEX "members_auth_user_idx" ON "members" USING btree ("auth_user_id");
    CREATE INDEX "members_membership_identity_idx" ON "members" USING btree ("membership_identity");
    CREATE INDEX "account_claims_contacts_order_idx" ON "account_claims_contacts" USING btree ("_order");
    CREATE INDEX "account_claims_contacts_parent_id_idx" ON "account_claims_contacts" USING btree ("_parent_id");
    CREATE INDEX "account_claims_member_idx" ON "account_claims" USING btree ("member_id");
    CREATE INDEX "account_claims_auth_user_idx" ON "account_claims" USING btree ("auth_user_id");
    CREATE INDEX "account_claims_status_idx" ON "account_claims" USING btree ("status");
    CREATE UNIQUE INDEX "account_claims_idempotency_key_idx" ON "account_claims" USING btree ("idempotency_key");
    CREATE UNIQUE INDEX "account_claims_active_member_idx" ON "account_claims" USING btree ("member_id") WHERE "status" = 'pendingReview';
    CREATE UNIQUE INDEX "account_claims_active_auth_user_idx" ON "account_claims" USING btree ("auth_user_id") WHERE "status" = 'pendingReview';
    CREATE INDEX "account_claims_submitted_at_idx" ON "account_claims" USING btree ("submitted_at");
    CREATE INDEX "account_claims_request_id_idx" ON "account_claims" USING btree ("request_id");
    CREATE INDEX "account_claims_reviewed_by_idx" ON "account_claims" USING btree ("reviewed_by_id");
    CREATE INDEX "account_claims_updated_at_idx" ON "account_claims" USING btree ("updated_at");
    CREATE INDEX "account_claims_created_at_idx" ON "account_claims" USING btree ("created_at");
    CREATE INDEX "member_intake_applications_contacts_order_idx" ON "member_intake_applications_contacts" USING btree ("_order");
    CREATE INDEX "member_intake_applications_contacts_parent_id_idx" ON "member_intake_applications_contacts" USING btree ("_parent_id");
    CREATE INDEX "member_intake_applications_status_idx" ON "member_intake_applications" USING btree ("status");
    CREATE INDEX "member_intake_applications_student_number_idx" ON "member_intake_applications" USING btree ("student_number");
    CREATE UNIQUE INDEX "member_intake_applications_idempotency_key_idx" ON "member_intake_applications" USING btree ("idempotency_key");
    CREATE INDEX "member_intake_applications_submitted_at_idx" ON "member_intake_applications" USING btree ("submitted_at");
    CREATE INDEX "member_intake_applications_request_id_idx" ON "member_intake_applications" USING btree ("request_id");
    CREATE INDEX "member_intake_applications_member_idx" ON "member_intake_applications" USING btree ("member_id");
    CREATE INDEX "member_intake_applications_reviewed_by_idx" ON "member_intake_applications" USING btree ("reviewed_by_id");
    CREATE INDEX "member_intake_applications_updated_at_idx" ON "member_intake_applications" USING btree ("updated_at");
    CREATE INDEX "member_intake_applications_created_at_idx" ON "member_intake_applications" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "account_claims_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_intake_applications_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_account_claims_fk" FOREIGN KEY ("account_claims_id") REFERENCES "public"."account_claims"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_intake_applications_fk" FOREIGN KEY ("member_intake_applications_id") REFERENCES "public"."member_intake_applications"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_account_claims_id_idx" ON "payload_locked_documents_rels" USING btree ("account_claims_id");
    CREATE INDEX "payload_locked_documents_rels_member_intake_applications_idx" ON "payload_locked_documents_rels" USING btree ("member_intake_applications_id");
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M010_DOWN_UNSUPPORTED: member identity and account-claim lifecycle data are forward-only',
  )
}
