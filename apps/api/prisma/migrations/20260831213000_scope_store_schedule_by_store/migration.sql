-- Store schedule identity contraction:
-- - keep the existing physical "storeId" UUID columns;
-- - remove the hard-coded single-store defaults so callers must provide store identity;
-- - scope BusinessHour weekday uniqueness to one Store instead of the whole table.

ALTER TABLE "BusinessHour"
ALTER COLUMN "storeId" DROP DEFAULT;

ALTER TABLE "Holiday"
ALTER COLUMN "storeId" DROP DEFAULT;

DROP INDEX "BusinessHour_weekday_key";

CREATE UNIQUE INDEX "BusinessHour_storeId_weekday_key"
ON "BusinessHour"("storeId", "weekday");
