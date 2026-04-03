-- CreateTable
CREATE TABLE "UberOptionChildGroupBinding" (
    "id" UUID NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "parentOptionChoiceStableId" TEXT NOT NULL,
    "childTemplateGroupStableId" TEXT NOT NULL,
    "isBound" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberOptionChildGroupBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UberOptionChildGroupBinding_storeId_parentOptionChoiceStabl_idx" ON "UberOptionChildGroupBinding"("storeId", "parentOptionChoiceStableId");

-- CreateIndex
CREATE INDEX "UberOptionChildGroupBinding_storeId_childTemplateGroupStabl_idx" ON "UberOptionChildGroupBinding"("storeId", "childTemplateGroupStableId");

-- CreateIndex
CREATE UNIQUE INDEX "UberOptionChildGroupBinding_storeId_parentOptionChoiceStabl_key" ON "UberOptionChildGroupBinding"("storeId", "parentOptionChoiceStableId", "childTemplateGroupStableId");
