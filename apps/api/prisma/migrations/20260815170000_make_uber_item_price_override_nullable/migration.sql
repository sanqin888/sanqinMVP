-- A missing value means the Uber item inherits the current SanQ source price.
ALTER TABLE "UberItemChannelConfig"
ALTER COLUMN "priceCents" DROP NOT NULL;
