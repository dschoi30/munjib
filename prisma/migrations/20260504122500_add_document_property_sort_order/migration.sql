-- AlterTable
ALTER TABLE "DocumentProperty" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DocumentProperty_documentId_sortOrder_idx" ON "DocumentProperty"("documentId", "sortOrder");
