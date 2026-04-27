-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetDocumentId" TEXT,
    "targetTitleRaw" TEXT NOT NULL,
    "alias" TEXT,
    "linkType" TEXT NOT NULL DEFAULT 'wiki',
    "isBroken" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentLink_workspaceId_idx" ON "DocumentLink"("workspaceId");

-- CreateIndex
CREATE INDEX "DocumentLink_sourceDocumentId_idx" ON "DocumentLink"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "DocumentLink_targetDocumentId_idx" ON "DocumentLink"("targetDocumentId");

-- CreateIndex
CREATE INDEX "DocumentLink_workspaceId_targetTitleRaw_idx" ON "DocumentLink"("workspaceId", "targetTitleRaw");

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_targetDocumentId_fkey" FOREIGN KEY ("targetDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
