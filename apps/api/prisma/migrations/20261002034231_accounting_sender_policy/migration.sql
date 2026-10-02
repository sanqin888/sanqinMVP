BEGIN;

-- CreateEnum
CREATE TYPE "AccountingSenderPolicyDecision"
AS ENUM ('TRUSTED', 'UNRECOGNIZED', 'IGNORED');

-- RenameTable
ALTER TABLE "AccountingTrustedSender"
RENAME TO "AccountingSenderPolicy";

ALTER TABLE "AccountingSenderPolicy"
RENAME CONSTRAINT "AccountingTrustedSender_pkey"
TO "AccountingSenderPolicy_pkey";

ALTER TABLE "AccountingSenderPolicy"
RENAME CONSTRAINT "AccountingTrustedSender_email_check"
TO "AccountingSenderPolicy_email_check";

ALTER TABLE "AccountingSenderPolicy"
RENAME COLUMN "trustedSenderStableId"
TO "senderPolicyStableId";

ALTER INDEX "AccountingTrustedSender_trustedSenderStableId_key"
RENAME TO "AccountingSenderPolicy_senderPolicyStableId_key";

ALTER INDEX "AccountingTrustedSender_email_key"
RENAME TO "AccountingSenderPolicy_email_key";

ALTER TABLE "AccountingSenderPolicy"
ADD COLUMN "decision" "AccountingSenderPolicyDecision";

UPDATE "AccountingSenderPolicy"
SET "decision" = CASE
  WHEN "isActive" = true
    THEN 'TRUSTED'::"AccountingSenderPolicyDecision"
  ELSE
    'UNRECOGNIZED'::"AccountingSenderPolicyDecision"
END;

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

ALTER TABLE "AccountingSenderPolicy"
ALTER COLUMN "decision" SET NOT NULL;

DROP INDEX "AccountingTrustedSender_isActive_email_idx";

CREATE INDEX "AccountingSenderPolicy_decision_email_idx"
ON "AccountingSenderPolicy"("decision", "email");

ALTER TABLE "AccountingSenderPolicy"
DROP COLUMN "isActive";

COMMIT;