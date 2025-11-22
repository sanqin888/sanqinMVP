/*
  Warnings:

  - The primary key for the `CheckoutIntent` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `metadata` on the `CheckoutIntent` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[clientRequestId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `metadataJson` to the `CheckoutIntent` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `CheckoutIntent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "CheckoutIntent" DROP CONSTRAINT "CheckoutIntent_pkey",
DROP COLUMN "metadata",
ADD COLUMN     "metadataJson" JSONB NOT NULL,
ADD COLUMN     "orderId" UUID,
ADD COLUMN     "result" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "locale" DROP NOT NULL,
ADD CONSTRAINT "CheckoutIntent_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CheckoutIntent_referenceId_createdAt_idx"
  ON "CheckoutIntent"("referenceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Order_clientRequestId_key"
  ON "Order"("clientRequestId");
