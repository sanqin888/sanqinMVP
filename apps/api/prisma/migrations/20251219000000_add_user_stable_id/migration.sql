ALTER TABLE "User" ADD COLUMN "userStableId" TEXT;

UPDATE "User"
SET "userStableId" = 'c' || substring(md5(id), 1, 23)
WHERE "userStableId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "userStableId" SET NOT NULL;

CREATE UNIQUE INDEX "User_userStableId_key" ON "User"("userStableId");
