import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { buildDocumentChunkVectorIndexSql, ensureDocumentChunkVectorIndex } from "@/lib/rag/vector-index";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(),
  },
}));

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("document chunk vector index setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the HNSW index out of Prisma migration history", () => {
    const migration = read("prisma/migrations/20260530023000_add_document_chunks_pgvector/migration.sql");

    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(migration).not.toContain("DocumentChunk_embedding_hnsw_idx");
  });

  it("exposes vector index setup through the database migrate script", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

    expect(packageJson.scripts["db:rag:index"]).toBe("tsx scripts/db/ensure-rag-vector-index.ts");
    expect(packageJson.scripts["db:migrate"]).toContain("pnpm run db:rag:index");
  });

  it("builds an idempotent HNSW cosine index SQL statement", () => {
    const sql = buildDocumentChunkVectorIndexSql();

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"');
    expect(sql).toContain('ON "DocumentChunk"');
    expect(sql).toContain("USING hnsw");
    expect(sql).toContain('"embedding" vector_cosine_ops');
  });

  it("executes the HNSW index SQL as a static statement", async () => {
    await ensureDocumentChunkVectorIndex();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(buildDocumentChunkVectorIndexSql());
  });
});
