-- CreateTable
CREATE TABLE "AccountingEvidenceFolder" (
    "id" UUID NOT NULL,
    "folderStableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdByUserStableId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingEvidenceFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEvidenceFolderAssignment" (
    "artifactId" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "movedByUserStableId" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingEvidenceFolderAssignment_pkey" PRIMARY KEY ("artifactId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEvidenceFolder_folderStableId_key" ON "AccountingEvidenceFolder"("folderStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEvidenceFolder_nameKey_key" ON "AccountingEvidenceFolder"("nameKey");

-- CreateIndex
CREATE INDEX "AccountingEvidenceFolder_createdAt_idx" ON "AccountingEvidenceFolder"("createdAt");

-- CreateIndex
CREATE INDEX "AccountingEvidenceFolderAssignment_folderId_movedAt_idx" ON "AccountingEvidenceFolderAssignment"("folderId", "movedAt");

-- AddForeignKey
ALTER TABLE "AccountingEvidenceFolderAssignment" ADD CONSTRAINT "AccountingEvidenceFolderAssignment_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEvidenceFolderAssignment" ADD CONSTRAINT "AccountingEvidenceFolderAssignment_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AccountingEvidenceFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
