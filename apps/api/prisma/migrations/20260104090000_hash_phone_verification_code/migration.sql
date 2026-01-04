-- Store only hashed phone verification codes
ALTER TABLE "PhoneVerification" ADD COLUMN     "codeHash" TEXT NOT NULL DEFAULT '';

ALTER TABLE "PhoneVerification" DROP COLUMN "code";

ALTER TABLE "PhoneVerification" ALTER COLUMN "codeHash" DROP DEFAULT;
