-- CreateEnum
CREATE TYPE "MenuItemKind" AS ENUM ('FOOD', 'BEVERAGE');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "itemKind" "MenuItemKind" NOT NULL DEFAULT 'FOOD';
