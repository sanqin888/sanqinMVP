-- CreateEnum
CREATE TYPE "CouponTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "CouponProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "CouponProgramTriggerType" AS ENUM ('SIGNUP_COMPLETED', 'REFERRAL_QUALIFIED');

-- CreateTable
CREATE TABLE "CouponTemplate" (
    "id" UUID NOT NULL,
    "couponStableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CouponTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "useRule" JSONB NOT NULL,
    "issueRule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponProgram" (
    "id" UUID NOT NULL,
    "programStableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CouponProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "CouponProgramTriggerType" NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "eligibility" JSONB,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponProgram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CouponTemplate_couponStableId_key" ON "CouponTemplate"("couponStableId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponProgram_programStableId_key" ON "CouponProgram"("programStableId");
