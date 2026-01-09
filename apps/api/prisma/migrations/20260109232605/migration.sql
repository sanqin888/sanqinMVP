-- CreateTable
CREATE TABLE "MenuOptionChoiceLink" (
    "id" TEXT NOT NULL,
    "parentOptionId" TEXT NOT NULL,
    "childOptionId" TEXT NOT NULL,

    CONSTRAINT "MenuOptionChoiceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuOptionChoiceLink_childOptionId_idx" ON "MenuOptionChoiceLink"("childOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuOptionChoiceLink_parentOptionId_childOptionId_key" ON "MenuOptionChoiceLink"("parentOptionId", "childOptionId");

-- AddForeignKey
ALTER TABLE "MenuOptionChoiceLink" ADD CONSTRAINT "MenuOptionChoiceLink_parentOptionId_fkey" FOREIGN KEY ("parentOptionId") REFERENCES "MenuOptionTemplateChoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuOptionChoiceLink" ADD CONSTRAINT "MenuOptionChoiceLink_childOptionId_fkey" FOREIGN KEY ("childOptionId") REFERENCES "MenuOptionTemplateChoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
