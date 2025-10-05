-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'making', 'ready', 'completed');

-- DropForeignKey
ALTER TABLE "public"."OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'pending',
ALTER COLUMN "pickupCode" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
