-- CreateEnum
CREATE TYPE "AccountingSenderPolicyDecision"
AS ENUM ('TRUSTED', 'UNRECOGNIZED', 'IGNORED');

-- RenameTable
-- This is the same persisted Accounting sender entity.
-- Preserve all rows, UUIDs, stable IDs, timestamps and audit linkage.
ALTER TABLE "AccountingTrustedSender"
RENAME TO "AccountingSenderPolicy";

-- Rename primary-key constraint so the physical schema matches the new model name.
ALTER TABLE "AccountingSenderPolicy"
RENAME CONSTRAINT "AccountingTrustedSender_pkey"
TO "AccountingSenderPolicy_pkey";

-- Preserve the existing database-level normalized-email invariant.
ALTER TABLE "AccountingSenderPolicy"
RENAME CONSTRAINT "AccountingTrustedSender_email_check"
TO "AccountingSenderPolicy_email_check";

-- Rename stable business ID column in place.
-- Existing acctsender_* values must remain unchanged.
ALTER TABLE "AccountingSenderPolicy"
RENAME COLUMN "trustedSenderStableId"
TO "senderPolicyStableId";

-- Rename existing unique indexes instead of dropping/recreating them.
ALTER INDEX "AccountingTrustedSender_trustedSenderStableId_key"
RENAME TO "AccountingSenderPolicy_senderPolicyStableId_key";

ALTER INDEX "AccountingTrustedSender_email_key"
RENAME TO "AccountingSenderPolicy_email_key";

-- Add the new tri-state policy column as nullable first so existing rows
-- can be deterministically backfilled before NOT NULL is enforced.
ALTER TABLE "AccountingSenderPolicy"
ADD COLUMN "decision" "AccountingSenderPolicyDecision";

-- Deterministic legacy mapping:
--   isActive = true  -> TRUSTED
--   isActive = false -> UNRECOGNIZED
--
-- IGNORED did not exist in the legacy model and must never be inferred
-- from historical isActive=false rows.
UPDATE "AccountingSenderPolicy"
SET "decision" = CASE
  WHEN "isActive" = true
    THEN 'TRUSTED'::"AccountingSenderPolicyDecision"
  ELSE
    'UNRECOGNIZED'::"AccountingSenderPolicyDecision"
END;

-- Fail closed if the backfill did not cover every existing row or if
-- the deterministic legacy mapping was violated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AccountingSenderPolicy"
    WHERE "decision" IS NULL
  ) THEN
    RAISE EXCEPTION
      'AccountingSenderPolicy migration failed: decision backfill left NULL rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AccountingSenderPolicy"
    WHERE
      ("isActive" = true AND "decision" <> 'TRUSTED'::"AccountingSenderPolicyDecision")
      OR
      ("isActive" = false AND "decision" <> 'UNRECOGNIZED'::"AccountingSenderPolicyDecision")
  ) THEN
    RAISE EXCEPTION
      'AccountingSenderPolicy migration failed: legacy isActive mapping mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AccountingSenderPolicy"
    WHERE "decision" = 'IGNORED'::"AccountingSenderPolicyDecision"
  ) THEN
    RAISE EXCEPTION
      'AccountingSenderPolicy migration failed: historical rows must not be inferred as IGNORED';
  END IF;
END
$$;

-- The new Prisma model requires decision to be non-null.
ALTER TABLE "AccountingSenderPolicy"
ALTER COLUMN "decision" SET NOT NULL;

-- Replace the legacy lookup index before removing isActive.
DROP INDEX "AccountingTrustedSender_isActive_email_idx";

CREATE INDEX "AccountingSenderPolicy_decision_email_idx"
ON "AccountingSenderPolicy"("decision", "email");

-- Legacy state has now been fully and deterministically represented by decision.
ALTER TABLE "AccountingSenderPolicy"
DROP COLUMN "isActive";