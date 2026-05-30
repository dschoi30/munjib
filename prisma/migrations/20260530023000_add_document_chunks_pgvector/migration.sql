CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "headingPath" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentChunk_documentId_embeddingModel_chunkIndex_key"
ON "DocumentChunk"("documentId", "embeddingModel", "chunkIndex");

CREATE INDEX "DocumentChunk_workspaceId_embeddingModel_idx"
ON "DocumentChunk"("workspaceId", "embeddingModel");

CREATE INDEX "DocumentChunk_documentId_idx"
ON "DocumentChunk"("documentId");

ALTER TABLE "DocumentChunk"
ADD CONSTRAINT "DocumentChunk_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
