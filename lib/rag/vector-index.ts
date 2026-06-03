import { prisma } from "@/lib/db/client";

export function buildDocumentChunkVectorIndexSql() {
  return `
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
ON "DocumentChunk"
USING hnsw ("embedding" vector_cosine_ops)
`.trim();
}

export async function ensureDocumentChunkVectorIndex() {
  await prisma.$executeRawUnsafe(buildDocumentChunkVectorIndexSql());
}
