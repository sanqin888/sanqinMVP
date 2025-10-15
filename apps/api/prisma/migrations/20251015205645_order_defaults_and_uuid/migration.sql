-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "subtotalCents" SET DEFAULT 0,
ALTER COLUMN "taxCents" SET DEFAULT 0,
ALTER COLUMN "totalCents" SET DEFAULT 0,
ALTER COLUMN "channel" SET DEFAULT 'web',
ALTER COLUMN "fulfillmentType" SET DEFAULT 'pickup';
