import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  indexSavedDocument,
  safeIndexSavedDocument,
  scheduleSavedDocumentIndex,
} from "@/lib/rag/index-document";
import type { SavedDocumentForIndex } from "@/lib/rag/index-document";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    document: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const savedDocument = {
  id: "doc-1",
  workspaceId: "workspace-1",
  title: "Runbook",
  contentMarkdown: "# Runbook\n\nSaved content",
  updatedAt: new Date("2026-05-30T00:00:00.000Z"),
};

const _indexInputMustRejectDraftFields: Parameters<typeof indexSavedDocument>[0] = {
  document: savedDocument,
  embedText: async () => [],
  replaceDocumentChunks: async () => undefined,
  // @ts-expect-error draft markdown must not be part of the saved-document indexing API
  contentMarkdown: "# Draft only",
};

void _indexInputMustRejectDraftFields;

describe("document RAG indexing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds saved chunks and writes them to the vector store", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));

    await indexSavedDocument({
      document: savedDocument,
      embeddingModel: "bge-m3",
      embedText,
      replaceDocumentChunks,
    });

    expect(embedText).toHaveBeenCalledWith("# Runbook\n\nSaved content");
    expect(replaceDocumentChunks).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc-1",
      embeddingModel: "bge-m3",
      sourceUpdatedAt: savedDocument.updatedAt,
      chunks: [
        expect.objectContaining({
          workspaceId: "workspace-1",
          documentId: "doc-1",
          sourceUpdatedAt: savedDocument.updatedAt,
          embeddingModel: "bge-m3",
        }),
      ],
    }));
  });

  it("uses the current provider-neutral embedding index id by default", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));

    await indexSavedDocument({
      document: savedDocument,
      embedText,
      replaceDocumentChunks,
    });

    expect(replaceDocumentChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        embeddingModel: "bge-m3",
      }),
    );
  });

  it("embeds chunks sequentially to avoid overloading local Ollama", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);
    let activeEmbeddingRequests = 0;
    let maxActiveEmbeddingRequests = 0;
    const embedText = vi.fn(async () => {
      activeEmbeddingRequests += 1;
      maxActiveEmbeddingRequests = Math.max(maxActiveEmbeddingRequests, activeEmbeddingRequests);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeEmbeddingRequests -= 1;
      return Array.from({ length: 1024 }, () => 0.01);
    });

    await indexSavedDocument({
      document: {
        ...savedDocument,
        contentMarkdown: "# One\n\nFirst\n\n# Two\n\nSecond\n\n# Three\n\nThird",
      },
      embeddingModel: "bge-m3",
      embedText,
      replaceDocumentChunks,
    });

    expect(embedText).toHaveBeenCalledTimes(3);
    expect(maxActiveEmbeddingRequests).toBe(1);
  });

  it("clears existing chunks for an empty saved document", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));

    await indexSavedDocument({
      document: {
        ...savedDocument,
        contentMarkdown: "   \n\n",
      },
      embeddingModel: "bge-m3",
      embedText,
      replaceDocumentChunks,
    });

    expect(embedText).not.toHaveBeenCalled();
    expect(replaceDocumentChunks).toHaveBeenCalledWith({
      documentId: "doc-1",
      embeddingModel: "bge-m3",
      sourceUpdatedAt: savedDocument.updatedAt,
      chunks: [],
    });
  });

  it("uses saved document fields even if callers pass draft-like extras", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));

    await indexSavedDocument({
      document: savedDocument,
      embeddingModel: "bge-m3",
      embedText,
      replaceDocumentChunks,
      draftTitle: "Unsaved Draft",
      draftContentMarkdown: "# Unsaved Draft",
      workspaceId: "caller-workspace",
    } as unknown as Parameters<typeof indexSavedDocument>[0]);

    expect(embedText).toHaveBeenCalledWith(savedDocument.contentMarkdown);
    expect(replaceDocumentChunks.mock.calls[0]?.[0].chunks[0]).toEqual(
      expect.objectContaining({
        workspaceId: savedDocument.workspaceId,
        documentId: savedDocument.id,
        sourceUpdatedAt: savedDocument.updatedAt,
      }),
    );
  });

  it("loads the saved document from the DB by ID when no loader is supplied", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));
    const findUnique = prisma.document.findUnique as unknown as ReturnType<typeof vi.fn>;
    findUnique.mockResolvedValueOnce({
      ...savedDocument,
      id: "saved-doc",
      workspaceId: "saved-workspace",
    });
    findUnique.mockResolvedValueOnce({ updatedAt: savedDocument.updatedAt });

    await expect(
      safeIndexSavedDocument({
        documentId: "saved-doc",
        embeddingModel: "bge-m3",
        embedText,
        replaceDocumentChunks,
      }),
    ).resolves.toBe(true);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "saved-doc" },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        contentMarkdown: true,
        updatedAt: true,
      },
    });
    expect(replaceDocumentChunks.mock.calls[0]?.[0].chunks[0]).toEqual(
      expect.objectContaining({
        documentId: "saved-doc",
        workspaceId: "saved-workspace",
      }),
    );
  });

  it("propagates privacy-safe logging through the safe indexing wrapper", async () => {
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);

    await expect(
      safeIndexSavedDocument({
        documentId: savedDocument.id,
        privacySafeLogging: true,
        loadDocument: async () => savedDocument,
        embedText,
        replaceDocumentChunks,
        isDocumentCurrent: async () => true,
      }),
    ).resolves.toBe(true);

    expect(embedText).toHaveBeenCalledWith(
      savedDocument.contentMarkdown,
      { privacySafeLogging: true },
    );
  });

  it("skips replacing chunks when the saved document changed during indexing", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));

    await expect(
      indexSavedDocument({
        document: savedDocument,
        embeddingModel: "bge-m3",
        embedText,
        replaceDocumentChunks,
        isDocumentCurrent: async () => false,
      }),
    ).resolves.toBe(false);

    expect(embedText).toHaveBeenCalledWith(savedDocument.contentMarkdown);
    expect(replaceDocumentChunks).not.toHaveBeenCalled();
  });

  it("returns false when guarded chunk replacement detects a stale document", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(false);
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));

    await expect(
      indexSavedDocument({
        document: savedDocument,
        embeddingModel: "bge-m3",
        embedText,
        replaceDocumentChunks,
      }),
    ).resolves.toBe(false);
  });

  it("preserves stale replacement results from the default transaction wrapper", async () => {
    const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
    transaction.mockImplementationOnce(async (callback) =>
      callback({
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      }),
    );
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));

    await expect(
      indexSavedDocument({
        document: savedDocument,
        embeddingModel: "bge-m3",
        embedText,
      }),
    ).resolves.toBe(false);
  });

  it("schedules safe indexing through a request after hook without awaiting completion", () => {
    const scheduledTasks: Array<() => unknown | Promise<unknown>> = [];
    const scheduleAfter = vi.fn((task: () => unknown | Promise<unknown>) => {
      scheduledTasks.push(task);
    });
    const loadDocument = vi.fn(() => new Promise<SavedDocumentForIndex>(() => undefined));

    expect(scheduleSavedDocumentIndex({ documentId: "doc-1", loadDocument, scheduleAfter })).toBeUndefined();
    expect(scheduleAfter).toHaveBeenCalledTimes(1);
    expect(loadDocument).not.toHaveBeenCalled();

    void scheduledTasks[0]?.();
    expect(loadDocument).toHaveBeenCalledWith("doc-1");
  });

  it("does not run default scheduled indexing in test environments", () => {
    const findUnique = prisma.document.findUnique as unknown as ReturnType<typeof vi.fn>;

    expect(scheduleSavedDocumentIndex({ documentId: "doc-1" })).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("does not throw from the safe wrapper", async () => {
    const logger = vi.fn();
    await expect(
      safeIndexSavedDocument({
        documentId: "doc-1",
        loadDocument: async () => {
          throw new Error("OLLAMA_REQUEST_FAILED");
        },
        logger,
      }),
    ).resolves.toBe(false);
    expect(logger).toHaveBeenCalledWith("doc-1", expect.any(Error));
  });
});
