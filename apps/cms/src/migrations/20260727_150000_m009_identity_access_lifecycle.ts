import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE invalid_username record;
    BEGIN
      SELECT "id", "username" INTO invalid_username
      FROM "auth_users"
      WHERE "username" <> lower(btrim("username"))
         OR "username" !~ '^[a-z][a-z0-9._-]{2,31}$'
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = format(
            'M009_INVALID_LEGACY_USERNAME user=%s username=%s',
            invalid_username."id",
            invalid_username."username"
          );
      END IF;
    END $$;

    DO $$
    DECLARE duplicate_override record;
    BEGIN
      SELECT "user_id", "permission", count(*) AS "duplicate_count"
      INTO duplicate_override
      FROM "permission_overrides"
      WHERE "scope_type" = 'global'
      GROUP BY "user_id", "permission"
      HAVING count(*) > 1
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = format(
            'M009_DUPLICATE_ACTIVE_GLOBAL_OVERRIDE user=%s permission=%s count=%s',
            duplicate_override."user_id",
            duplicate_override."permission",
            duplicate_override."duplicate_count"
          );
      END IF;
    END $$;

    DO $$
    DECLARE duplicate_override record;
    BEGIN
      SELECT "user_id", "permission", "recruitment_cycle_id", count(*) AS "duplicate_count"
      INTO duplicate_override
      FROM "permission_overrides"
      WHERE "scope_type" = 'recruitmentCycle'
      GROUP BY "user_id", "permission", "recruitment_cycle_id"
      HAVING count(*) > 1
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = format(
            'M009_DUPLICATE_ACTIVE_CYCLE_OVERRIDE user=%s permission=%s cycle=%s count=%s',
            duplicate_override."user_id",
            duplicate_override."permission",
            duplicate_override."recruitment_cycle_id",
            duplicate_override."duplicate_count"
          );
      END IF;
    END $$;

    ALTER TYPE "public"."enum_permission_overrides_permission"
      ADD VALUE IF NOT EXISTS 'accounts.manage';
    CREATE TYPE "public"."enum_auth_users_account_type" AS ENUM('student', 'external');
    CREATE TYPE "public"."enum_auth_users_status" AS ENUM('pendingActivation', 'active', 'disabled');

    ALTER TABLE "auth_users" ADD COLUMN "account_type" "enum_auth_users_account_type";
    ALTER TABLE "auth_users" ADD COLUMN "student_number" varchar;
    ALTER TABLE "auth_users" ADD COLUMN "status" "enum_auth_users_status";
    ALTER TABLE "auth_users" ADD COLUMN "default_role_expires_at" timestamp(3) with time zone;
    ALTER TABLE "auth_users" ADD COLUMN "temporary_credential_expires_at" timestamp(3) with time zone;
    ALTER TABLE "auth_users" ADD COLUMN "record_version" numeric;

    ALTER TABLE "permission_overrides" ADD COLUMN "reason" varchar;
    ALTER TABLE "permission_overrides" ADD COLUMN "granted_by_id" uuid;
    ALTER TABLE "permission_overrides" ADD COLUMN "granted_at" timestamp(3) with time zone;
    ALTER TABLE "permission_overrides" ADD COLUMN "revoked_by_id" uuid;
    ALTER TABLE "permission_overrides" ADD COLUMN "revoked_at" timestamp(3) with time zone;

    UPDATE "auth_users"
    SET
      "account_type" = 'external',
      "status" = 'active',
      "default_role_expires_at" = "access_expires_at",
      "temporary_credential_expires_at" = NULL,
      "record_version" = 1;

    ALTER TABLE "auth_users" ALTER COLUMN "account_type" SET DEFAULT 'external';
    ALTER TABLE "auth_users" ALTER COLUMN "account_type" SET NOT NULL;
    ALTER TABLE "auth_users" ALTER COLUMN "status" SET DEFAULT 'pendingActivation';
    ALTER TABLE "auth_users" ALTER COLUMN "status" SET NOT NULL;
    ALTER TABLE "auth_users" ALTER COLUMN "record_version" SET DEFAULT 1;
    ALTER TABLE "auth_users" ALTER COLUMN "record_version" SET NOT NULL;

    CREATE FUNCTION "public"."m009_reject_auth_user_record_version_regression"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $m009_function$
    BEGIN
      IF NEW."record_version" < OLD."record_version" THEN
        RAISE EXCEPTION USING
          ERRCODE = '40001',
          MESSAGE = 'M009_AUTH_USER_STALE_WRITE';
      END IF;
      RETURN NEW;
    END;
    $m009_function$;

    CREATE TRIGGER "auth_users_record_version_no_regression"
      BEFORE UPDATE ON "public"."auth_users"
      FOR EACH ROW
      EXECUTE FUNCTION "public"."m009_reject_auth_user_record_version_regression"();

    ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_identity_shape" CHECK (
      (
        "account_type" = 'student'
        AND "student_number" IS NOT NULL
        AND "student_number" ~ '^[0-9]{6,32}$'
        AND "username" = "student_number"
      )
      OR
      (
        "account_type" = 'external'
        AND "student_number" IS NULL
        AND "username" = lower(btrim("username"))
        AND "username" ~ '^[a-z][a-z0-9._-]{2,31}$'
      )
    );
    ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_grant_attribution" CHECK (
      ("reason" IS NULL AND "granted_by_id" IS NULL AND "granted_at" IS NULL)
      OR
      ("reason" IS NOT NULL AND btrim("reason") <> '' AND "granted_by_id" IS NOT NULL AND "granted_at" IS NOT NULL)
    );
    ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_revoke_attribution" CHECK (
      ("revoked_by_id" IS NULL AND "revoked_at" IS NULL)
      OR
      ("revoked_by_id" IS NOT NULL AND "revoked_at" IS NOT NULL)
    );

    ALTER TABLE "permission_overrides"
      ADD CONSTRAINT "permission_overrides_granted_by_id_auth_users_id_fk"
      FOREIGN KEY ("granted_by_id") REFERENCES "public"."auth_users"("id")
      ON DELETE set null ON UPDATE no action;
    ALTER TABLE "permission_overrides"
      ADD CONSTRAINT "permission_overrides_revoked_by_id_auth_users_id_fk"
      FOREIGN KEY ("revoked_by_id") REFERENCES "public"."auth_users"("id")
      ON DELETE set null ON UPDATE no action;

    CREATE UNIQUE INDEX "auth_users_student_number_idx"
      ON "auth_users" USING btree ("student_number");
    CREATE INDEX "permission_overrides_granted_by_idx"
      ON "permission_overrides" USING btree ("granted_by_id");
    CREATE INDEX "permission_overrides_revoked_by_idx"
      ON "permission_overrides" USING btree ("revoked_by_id");
    CREATE UNIQUE INDEX "permission_overrides_active_global_idx"
      ON "permission_overrides" USING btree ("user_id", "permission")
      WHERE "revoked_at" IS NULL AND "scope_type" = 'global';
    CREATE UNIQUE INDEX "permission_overrides_active_cycle_idx"
      ON "permission_overrides" USING btree ("user_id", "permission", "recruitment_cycle_id")
      WHERE "revoked_at" IS NULL AND "scope_type" = 'recruitmentCycle';
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'M009_DOWN_UNSUPPORTED: identity lifecycle data and the accounts.manage enum are forward-only',
  )
}
