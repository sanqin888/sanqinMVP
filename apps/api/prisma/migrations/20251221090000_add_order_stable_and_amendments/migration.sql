ALTER TABLE "Order" ADD COLUMN "orderStableId" TEXT;
ALTER TABLE "Order" ADD COLUMN "rebillGroupId" TEXT;

UPDATE "Order"
SET "orderStableId" = 'c' || substring(md5(id), 1, 23)
WHERE "orderStableId" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "orderStableId" SET NOT NULL;

CREATE UNIQUE INDEX "Order_orderStableId_key" ON "Order"("orderStableId");
CREATE INDEX "Order_rebillGroupId_idx" ON "Order"("rebillGroupId");

CREATE TYPE "OrderAmendmentType" AS ENUM ('RETENDER', 'VOID_ITEM', 'SWAP_ITEM', 'ADDITIONAL_CHARGE');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'WECHAT_ALIPAY');
CREATE TYPE "OrderAmendmentItemAction" AS ENUM ('VOID', 'ADD');

CREATE TABLE "OrderAmendment" (
    "id" UUID NOT NULL,
    "amendmentStableId" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "type" "OrderAmendmentType" NOT NULL,
    "paymentMethod" "PaymentMethod",
    "reason" TEXT NOT NULL,
    "deltaCents" INTEGER NOT NULL DEFAULT 0,
    "refundCents" INTEGER NOT NULL DEFAULT 0,
    "additionalChargeCents" INTEGER NOT NULL DEFAULT 0,
    "rebillGroupId" TEXT,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAmendment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderAmendmentItem" (
    "id" UUID NOT NULL,
    "amendmentId" UUID NOT NULL,
    "action" "OrderAmendmentItemAction" NOT NULL,
    "productStableId" TEXT NOT NULL,
    "displayName" TEXT,
    "nameEn" TEXT,
    "nameZh" TEXT,
    "qty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER,
    "optionsJson" JSONB,

    CONSTRAINT "OrderAmendmentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAmendment_amendmentStableId_key" ON "OrderAmendment"("amendmentStableId");
CREATE INDEX "OrderAmendment_orderId_createdAt_idx" ON "OrderAmendment"("orderId", "createdAt");
CREATE INDEX "OrderAmendment_rebillGroupId_idx" ON "OrderAmendment"("rebillGroupId");
CREATE INDEX "OrderAmendmentItem_amendmentId_idx" ON "OrderAmendmentItem"("amendmentId");

ALTER TABLE "OrderAmendment" ADD CONSTRAINT "OrderAmendment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAmendmentItem" ADD CONSTRAINT "OrderAmendmentItem_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "OrderAmendment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
