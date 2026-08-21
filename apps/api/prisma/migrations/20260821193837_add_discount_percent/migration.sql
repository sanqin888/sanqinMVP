-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "discountPercent" INTEGER;

-- RenameIndex
ALTER INDEX "Order_fulfillmentTiming_scheduleActivatedAt_prepStartAt_status_" RENAME TO "Order_fulfillmentTiming_scheduleActivatedAt_prepStartAt_sta_idx";
