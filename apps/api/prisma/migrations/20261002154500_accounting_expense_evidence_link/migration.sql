-- CreateTable
CREATE TABLE "AccountingExpenseEvidenceLink" (
    "id" UUID NOT NULL,
    "linkStableId" TEXT NOT NULL,
    "notificationInboxItemId" UUID NOT NULL,
    "sourceInboxItemId" UUID NOT NULL,
    "linkedByUserStableId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExpenseEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpenseEvidenceLink_linkStableId_key" ON "AccountingExpenseEvidenceLink"("linkStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpenseEvidenceLink_notificationInboxItemId_key" ON "AccountingExpenseEvidenceLink"("notificationInboxItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpenseEvidenceLink_sourceInboxItemId_key" ON "AccountingExpenseEvidenceLink"("sourceInboxItemId");

-- CreateIndex
CREATE INDEX "AccountingExpenseEvidenceLink_linkedAt_idx" ON "AccountingExpenseEvidenceLink"("linkedAt");

-- AddForeignKey
ALTER TABLE "AccountingExpenseEvidenceLink" ADD CONSTRAINT "AccountingExpenseEvidenceLink_notificationInboxItemId_fkey" FOREIGN KEY ("notificationInboxItemId") REFERENCES "AccountingInboxItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExpenseEvidenceLink" ADD CONSTRAINT "AccountingExpenseEvidenceLink_sourceInboxItemId_fkey" FOREIGN KEY ("sourceInboxItemId") REFERENCES "AccountingInboxItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
