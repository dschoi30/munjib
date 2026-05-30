import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export const VECTOR_STORE_ERROR_CODES = {
  INVALID_EMBEDDING_VECTOR: "INVALID_EMBEDDING_VECTOR",
  INVALID_DOCUMENT_CHUNK_INPUT: "INVALID_DOCUMENT_CHUNK_INPUT",
} as const;

export type VectorChunkInput = {
  id: string;
  workspaceId: string;
  documentId: string;
  chunkIndex: number;
  headingPath: string | null;
  content: string;
  contentHash: string;
  sourceUpdatedAt: Date;
  tokenCount: number;
  embeddingModel: string;
  embedding: number[];
};

export type RetrievedChunk = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
  content: string;
  distance: number;
};

type ReplaceDocumentChunksInput = {
  documentId: string;
  embeddingModel: string;
  chunks: VectorChunkInput[];
};

type SearchSimilarChunksInput = {
  workspaceId: string;
  embeddingModel: string;
  embedding: number[];
  readableDocumentIds: string[];
  limit: number;
};

export function toPgVectorLiteral(embedding: number[]) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(VECTOR_STORE_ERROR_CODES.INVALID_EMBEDDING_VECTOR);
  }

  for (let index = 0; index < embedding.length; index += 1) {
    const value = embedding[index];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(VECTOR_STORE_ERROR_CODES.INVALID_EMBEDDING_VECTOR);
    }
  }

  return `[${embedding.join(",")}]`;
}

export function buildVectorSearchSql() {
  return `
SELECT
  "DocumentChunk"."id",
  "DocumentChunk"."documentId",
  "Document"."title" AS "documentTitle",
  "Document"."path" AS "documentPath",
  "DocumentChunk"."headingPath",
  "DocumentChunk"."content",
  "DocumentChunk"."embedding" <=> CAST($1 AS vector(1024)) AS "distance"
FROM "DocumentChunk"
JOIN "Document" ON "Document"."id" = "DocumentChunk"."documentId"
WHERE "DocumentChunk"."workspaceId" = $2
  AND "Document"."workspaceId" = $2
  AND "DocumentChunk"."embeddingModel" = $3
  AND "DocumentChunk"."sourceUpdatedAt" = "Document"."updatedAt"
  AND "DocumentChunk"."documentId" = ANY(CAST($4 AS text[]))
ORDER BY "DocumentChunk"."embedding" <=> CAST($1 AS vector(1024))
LIMIT $5
`.trim();
}

export function buildVectorInsertSql() {
  return `
INSERT INTO "DocumentChunk"
  ("id", "workspaceId", "documentId", "chunkIndex", "headingPath", "content", "contentHash", "sourceUpdatedAt", "tokenCount", "embeddingModel", "embedding", "updatedAt")
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CAST($11 AS vector(1024)), CURRENT_TIMESTAMP)
`.trim();
}

export async function replaceDocumentChunks(tx: Prisma.TransactionClient, input: ReplaceDocumentChunksInput) {
  const rows = input.chunks.map((chunk) => {
    if (chunk.documentId !== input.documentId || chunk.embeddingModel !== input.embeddingModel) {
      throw new Error(VECTOR_STORE_ERROR_CODES.INVALID_DOCUMENT_CHUNK_INPUT);
    }

    return {
      chunk,
      vectorLiteral: toPgVectorLiteral(chunk.embedding),
    };
  });

  await tx.documentChunk.deleteMany({
    where: { documentId: input.documentId, embeddingModel: input.embeddingModel },
  });

  for (const { chunk, vectorLiteral } of rows) {
    await tx.$executeRawUnsafe(
      buildVectorInsertSql(),
      chunk.id,
      chunk.workspaceId,
      chunk.documentId,
      chunk.chunkIndex,
      chunk.headingPath,
      chunk.content,
      chunk.contentHash,
      chunk.sourceUpdatedAt,
      chunk.tokenCount,
      chunk.embeddingModel,
      vectorLiteral,
    );
  }
}

export async function searchSimilarChunks(input: SearchSimilarChunksInput) {
  if (input.readableDocumentIds.length === 0) return [];

  return prisma.$queryRawUnsafe<RetrievedChunk[]>(
    buildVectorSearchSql(),
    toPgVectorLiteral(input.embedding),
    input.workspaceId,
    input.embeddingModel,
    input.readableDocumentIds,
    input.limit,
  );
}
