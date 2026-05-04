-- AlterTable
ALTER TABLE "DocumentLink" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DocumentLink_sourceDocumentId_sortOrder_idx" ON "DocumentLink"("sourceDocumentId", "sortOrder");
