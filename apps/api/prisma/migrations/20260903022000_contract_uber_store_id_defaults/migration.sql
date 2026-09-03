-- Remove the implicit single-store fallback from UberEats persistence.
-- Existing rows are intentionally preserved exactly as-is. Test Store / sandbox
-- history will be reviewed separately during the Uber Production Cutover Cleanup.
ALTER TABLE "UberItemChannelConfig" ALTER COLUMN "storeId" DROP DEFAULT;
ALTER TABLE "UberCategoryConfig" ALTER COLUMN "storeId" DROP DEFAULT;
ALTER TABLE "UberModifierGroupConfig" ALTER COLUMN "storeId" DROP DEFAULT;
ALTER TABLE "UberOptionItemConfig" ALTER COLUMN "storeId" DROP DEFAULT;
ALTER TABLE "UberOptionChildGroupBinding" ALTER COLUMN "storeId" DROP DEFAULT;
ALTER TABLE "UberMenuPublishVersion" ALTER COLUMN "storeId" DROP DEFAULT;
ALTER TABLE "UberReconciliationReport" ALTER COLUMN "storeId" DROP DEFAULT;
ALTER TABLE "UberOpsTicket" ALTER COLUMN "storeId" DROP DEFAULT;
