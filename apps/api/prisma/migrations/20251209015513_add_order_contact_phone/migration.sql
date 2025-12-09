-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT;

-- CreateIndex
CREATE INDEX "Order_contactPhone_createdAt_idx" ON "Order"("contactPhone", "createdAt");
