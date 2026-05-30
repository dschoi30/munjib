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

  it("schedules safe indexing without awaiting completion", () => {
    const loadDocument = vi.fn(() => new Promise<SavedDocumentForIndex>(() => undefined));

    expect(scheduleSavedDocumentIndex({ documentId: "doc-1", loadDocument })).toBeUndefined();
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
