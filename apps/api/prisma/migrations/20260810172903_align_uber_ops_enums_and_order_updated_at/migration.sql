/*
  Warnings:

  - Added the required column `updatedAt` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "UberOpsTicketPriority" ADD VALUE 'CRITICAL';

-- AlterEnum
ALTER TYPE "UberOpsTicketStatus" ADD VALUE 'CLOSED';

-- AlterEnum
ALTER TYPE "UberOpsTicketType" ADD VALUE 'RECONCILIATION';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
