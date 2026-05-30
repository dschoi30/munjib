import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  toPgVectorLiteral,
  buildVectorInsertSql,
  buildVectorSearchSql,
  buildCurrentDocumentLockSql,
  replaceDocumentChunks,
  searchSimilarChunks,
  type VectorChunkInput,
} from "@/lib/rag/vector-store";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

describe("vector store helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes numeric embeddings as pgvector literals", () => {
    expect(toPgVectorLiteral([0.1, -0.2, 0])).toBe("[0.1,-0.2,0]");
  });

  it("rejects empty embeddings", () => {
    expect(() => toPgVectorLiteral([])).toThrow("INVALID_EMBEDDING_VECTOR");
  });

  it("rejects non-finite embeddings", () => {
    expect(() => toPgVectorLiteral([Number.NaN])).toThrow("INVALID_EMBEDDING_VECTOR");
  });

  it("rejects infinite embeddings before raw SQL execution", () => {
    expect(() => toPgVectorLiteral([Number.POSITIVE_INFINITY])).toThrow("INVALID_EMBEDDING_VECTOR");
  });

  it("rejects non-number embeddings", () => {
    expect(() => toPgVectorLiteral(["0.1"] as unknown as number[])).toThrow(
      "INVALID_EMBEDDING_VECTOR",
    );
  });

  it("casts vector parameters with CAST syntax in static SQL", () => {
    expect(buildVectorInsertSql()).toContain("CAST($11 AS vector(1024))");
    expect(buildVectorInsertSql()).not.toContain("$11::vector");
    expect(buildVectorSearchSql()).toContain("CAST($1 AS vector(1024))");
    expect(buildVectorSearchSql()).not.toContain("$1::vector");
  });

  it("builds a stale-safe vector search query", () => {
    expect(buildVectorSearchSql()).toContain(
      '"DocumentChunk"."sourceUpdatedAt" = "Document"."updatedAt"',
    );
  });

  it("locks the current document row before guarded replacement", () => {
    expect(buildCurrentDocumentLockSql()).toContain('WHERE "id" = $1');
    expect(buildCurrentDocumentLockSql()).toContain('AND "updatedAt" = $2');
    expect(buildCurrentDocumentLockSql()).toContain("FOR UPDATE");
  });

  it("keeps readable document ids parameterized in static search SQL", () => {
    const sql = buildVectorSearchSql();

    expect(sql).toContain('"DocumentChunk"."documentId" = ANY(CAST($4 AS text[]))');
    expect(sql).not.toContain("doc-readable");
  });

  it("clears existing document chunks when replacement has no chunks", async () => {
    const tx = createTransactionMock();

    await replaceDocumentChunks(tx as unknown as Prisma.TransactionClient, {
      documentId: "doc-1",
      embeddingModel: "bge-m3",
      chunks: [],
    });

    expect(tx.documentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: "doc-1", embeddingModel: "bge-m3" },
    });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("validates replacement chunk document ids before deleting", async () => {
    const tx = createTransactionMock();

    await expect(
      replaceDocumentChunks(tx as unknown as Prisma.TransactionClient, {
        documentId: "doc-1",
        embeddingModel: "bge-m3",
        chunks: [createChunk({ documentId: "doc-2" })],
      }),
    ).rejects.toThrow("INVALID_DOCUMENT_CHUNK_INPUT");

    expect(tx.documentChunk.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("validates replacement chunk embedding models before deleting", async () => {
    const tx = createTransactionMock();

    await expect(
      replaceDocumentChunks(tx as unknown as Prisma.TransactionClient, {
        documentId: "doc-1",
        embeddingModel: "bge-m3",
        chunks: [createChunk({ embeddingModel: "other-model" })],
      }),
    ).rejects.toThrow("INVALID_DOCUMENT_CHUNK_INPUT");

    expect(tx.documentChunk.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("passes vector literals as bound insert parameters", async () => {
    const tx = createTransactionMock();

    await replaceDocumentChunks(tx as unknown as Prisma.TransactionClient, {
      documentId: "doc-1",
      embeddingModel: "bge-m3",
      chunks: [createChunk({ embedding: [0.1, 0.2] })],
    });

    const [sql, ...params] = tx.$executeRawUnsafe.mock.calls[0]!;
    expect(sql).toBe(buildVectorInsertSql());
    expect(sql).not.toContain("[0.1,0.2]");
    expect(params[10]).toBe("[0.1,0.2]");
  });

  it("does not delete chunks when the expected source timestamp is stale", async () => {
    const tx = createTransactionMock();
    tx.$queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      replaceDocumentChunks(tx as unknown as Prisma.TransactionClient, {
        documentId: "doc-1",
        embeddingModel: "bge-m3",
        sourceUpdatedAt: new Date("2026-05-30T00:00:00.000Z"),
        chunks: [createChunk()],
      }),
    ).resolves.toBe(false);

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      buildCurrentDocumentLockSql(),
      "doc-1",
      new Date("2026-05-30T00:00:00.000Z"),
    );
    expect(tx.documentChunk.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("returns no search results when no readable document ids are provided", async () => {
    const results = await searchSimilarChunks({
      workspaceId: "workspace-1",
      embeddingModel: "bge-m3",
      embedding: [0.1, 0.2],
      readableDocumentIds: [],
      limit: 5,
    });

    expect(results).toEqual([]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("passes vector literals and readable ids as bound search parameters", async () => {
    const queryRawUnsafe = prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>;
    queryRawUnsafe.mockResolvedValue([]);

    await searchSimilarChunks({
      workspaceId: "workspace-1",
      embeddingModel: "bge-m3",
      embedding: [0.1, 0.2],
      readableDocumentIds: ["doc-readable"],
      limit: 5,
    });

    const [sql, vectorLiteral, workspaceId, embeddingModel, readableDocumentIds, limit] =
      queryRawUnsafe.mock.calls[0]!;
    expect(sql).toBe(buildVectorSearchSql());
    expect(sql).not.toContain("[0.1,0.2]");
    expect(sql).not.toContain("doc-readable");
    expect(vectorLiteral).toBe("[0.1,0.2]");
    expect(workspaceId).toBe("workspace-1");
    expect(embeddingModel).toBe("bge-m3");
    expect(readableDocumentIds).toEqual(["doc-readable"]);
    expect(limit).toBe(5);
  });
});

function createChunk(overrides: Partial<VectorChunkInput> = {}): VectorChunkInput {
  return {
    id: "chunk-1",
    workspaceId: "workspace-1",
    documentId: "doc-1",
    chunkIndex: 0,
    headingPath: "Intro",
    content: "Chunk content",
    contentHash: "hash-1",
    sourceUpdatedAt: new Date("2026-05-30T00:00:00.000Z"),
    tokenCount: 2,
    embeddingModel: "bge-m3",
    embedding: [0.1, 0.2],
    ...overrides,
  };
}

function createTransactionMock() {
  return {
    documentChunk: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: "doc-1" }]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  };
}
