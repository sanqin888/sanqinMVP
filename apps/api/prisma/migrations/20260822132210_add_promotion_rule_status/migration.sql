-- CreateEnum
CREATE TYPE "PromotionRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "PromotionRuleType" AS ENUM ('PERCENTAGE_OFF', 'FIXED_AMOUNT_OFF', 'BUY_X_GET_Y', 'FREE_ITEM', 'LOYALTY_MULTIPLIER');

-- CreateTable
CREATE TABLE "PromotionRule" (
    "id" UUID NOT NULL,
    "stableId" TEXT NOT NULL,
    "titleZh" TEXT NOT NULL,
    "titleEn" TEXT,
    "description" TEXT,
    "type" "PromotionRuleType" NOT NULL,
    "status" "PromotionRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 175,
    "stackingPolicy" "CouponStackingPolicy" NOT NULL DEFAULT 'EXCLUSIVE',
    "excludesCoupons" BOOLEAN NOT NULL DEFAULT false,
    "excludesItemPromotions" BOOLEAN NOT NULL DEFAULT false,
    "channels" "Channel"[] DEFAULT ARRAY['web', 'in_store']::"Channel"[],
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startMinutes" INTEGER,
    "endMinutes" INTEGER,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PromotionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRule_stableId_key" ON "PromotionRule"("stableId");

-- CreateIndex
CREATE INDEX "PromotionRule_status_deletedAt_idx" ON "PromotionRule"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "PromotionRule_type_status_idx" ON "PromotionRule"("type", "status");
