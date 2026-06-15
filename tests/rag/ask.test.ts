import { randomUUID } from "node:crypto";
import { WorkspaceRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LangfuseCallbackConfigInput } from "@/lib/rag/langfuse";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { askDocumentQuestion } from "@/lib/rag/ask";
import { safeIndexSavedDocument } from "@/lib/rag/index-document";
import { invokeAnswerChain } from "@/lib/rag/answer-chain";
import { assertCurrentEmbeddingIndex, embedText } from "@/lib/rag/embedding-client";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

vi.mock("@/lib/rag/index-document", () => ({
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
}));

const chatModel = { invoke: vi.fn() };

vi.mock("@/lib/rag/embedding-client", () => ({
  assertCurrentEmbeddingIndex: vi.fn(),
  embedText: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01)),
}));

vi.mock("@/lib/rag/model-factory", () => ({
  createChatModel: vi.fn(() => chatModel),
}));

vi.mock("@/lib/rag/answer-chain", () => ({
  invokeAnswerChain: vi.fn().mockResolvedValue("Saved answer"),
}));

vi.mock("@/lib/rag/langfuse", () => ({
  createLangfuseCallbackConfig: vi.fn((input: LangfuseCallbackConfigInput) => ({
    callbacks: [],
    metadata: {
      operation: input.operation ?? "rag.answer",
      chatProvider: input.chatProvider,
      chatModel: input.chatModel,
      ...(input.embeddingProvider ? { embeddingProvider: input.embeddingProvider } : {}),
      ...(input.embeddingModel ? { embeddingModel: input.embeddingModel } : {}),
      ...(typeof input.embeddingDimensions === "number"
        ? { embeddingDimensions: input.embeddingDimensions }
        : {}),
      ...(input.citationDocumentIds
        ? { citationDocumentIds: Array.from(new Set(input.citationDocumentIds)) }
        : {}),
      ...(input.metadata ?? {}),
      captureMode: input.captureMode ?? input.capture ?? "metadata",
    },
  })),
}));

vi.mock("@/lib/rag/vector-store", () => ({
  searchSimilarChunks: vi.fn().mockResolvedValue([
    {
      id: "chunk-1",
      documentId: "doc-selected",
      documentTitle: "Saved Title",
      documentPath: "/saved-title",
      headingPath: "Facts",
      content: "Saved database content",
      distance: 0.1,
    },
  ]),
}));

const _askInputMustRejectDraftFields: Parameters<typeof askDocumentQuestion>[0] = {
  workspaceSlug: "workspace",
  documentId: "doc",
  actorId: "user",
  question: "question",
  // @ts-expect-error draft content must not be accepted by the ask service API
  draftContentMarkdown: "# Unsaved draft",
};

void _askInputMustRejectDraftFields;

describe("RAG ask service", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", "ollama");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "gemma4:e4b");
    vi.stubEnv("MUNJIB_RAG_EMBED_PROVIDER", "ollama");
    vi.stubEnv("MUNJIB_RAG_EMBED_MODEL", "bge-m3");
    vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", "1024");
    await resetTestData();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers from current saved document context without indexing or vector retrieval", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Saved Title",
      contentMarkdown: "# Facts\n\nSaved database content",
    });

    const result = await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "  What is saved?  ",
      draftTitle: "Unsaved Title",
      draftContentMarkdown: "# Draft\n\nDo not use this",
      contentMarkdown: "# Caller content",
    } as unknown as Parameters<typeof askDocumentQuestion>[0]);

    expect(result.answer).toBe("Saved answer");
    expect(result.citations).toEqual([
      {
        index: 1,
        documentId: selected.id,
        documentTitle: "Saved Title",
        documentPath: "/saved-title",
        headingPath: "Facts",
      },
    ]);
    expect(assertCurrentEmbeddingIndex).not.toHaveBeenCalled();
    expect(safeIndexSavedDocument).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
    expect(searchSimilarChunks).not.toHaveBeenCalled();
    expect(createChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        model: "gemma4:e4b",
        baseUrl: "http://localhost:11434",
      }),
    );
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "rag.ask_document",
        chatProvider: "ollama",
        chatModel: "gemma4:e4b",
        citationDocumentIds: [selected.id],
        metadata: expect.objectContaining({
          workspaceSlug: fixture.workspace.slug,
          workspaceId: fixture.workspace.id,
          selectedDocumentId: selected.id,
          actorId: fixture.user.id,
          contextPartial: false,
        }),
      }),
    );
    const traceInput = vi.mocked(createLangfuseCallbackConfig).mock.calls[0]?.[0];
    expect(traceInput).toEqual(expect.any(Object));
    expect(traceInput).not.toHaveProperty("retrievedChunkCount");
    expect(traceInput).not.toHaveProperty("citationChunkIds");
    const answerInput = vi.mocked(invokeAnswerChain).mock.calls[0]?.[0];
    expect(answerInput?.systemPrompt).toContain("Use only the current saved document context");
    expect(answerInput?.systemPrompt).toContain("Do not use other workspace documents");
    expect(answerInput?.userPrompt).toContain("# Facts\n\nSaved database content");
    expect(answerInput?.userPrompt).toContain("Saved database content");
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        chatModel,
        callbacks: [],
        metadata: expect.objectContaining({
          operation: "rag.ask_document",
          chatProvider: "ollama",
          citationDocumentIds: [selected.id],
          selectedDocumentId: selected.id,
          contextPartial: false,
        }),
      }),
    );
    expect(invokeAnswerChain).not.toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Do not use this"),
      }),
    );
  });

  it("throws DOCUMENT_NOT_FOUND when the selected document is not readable", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const restricted = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Restricted",
      contentMarkdown: "Private",
    });
    const otherUser = await prisma.user.create({
      data: { email: `other-${restricted.id}@example.com`, name: "Other User" },
    });
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: restricted.id,
        subjectType: "USER",
        subjectId: otherUser.id,
        permission: "READ",
      },
    });

    await expect(
      askDocumentQuestion({
        workspaceSlug: fixture.workspace.slug,
        documentId: restricted.id,
        actorId: fixture.user.id,
        question: "Can I read it?",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  });

  it("throws QUESTION_REQUIRED for blank questions", async () => {
    await expect(
      askDocumentQuestion({
        workspaceSlug: "workspace",
        documentId: "doc",
        actorId: "user",
        question: "  \n\t  ",
      }),
    ).rejects.toThrow("QUESTION_REQUIRED");
  });

  it("overrides only the chat model for answer generation", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Saved Title",
      contentMarkdown: "# Facts\n\nSaved database content",
    });

    await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "What is saved?",
      chatModelOverride: "moonshotai/kimi-k2.7-code",
    });

    expect(assertCurrentEmbeddingIndex).not.toHaveBeenCalled();
    expect(safeIndexSavedDocument).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
    expect(searchSimilarChunks).not.toHaveBeenCalled();
    expect(createChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        model: "moonshotai/kimi-k2.7-code",
        baseUrl: "http://localhost:11434",
      }),
    );
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        chatProvider: "ollama",
        chatModel: "moonshotai/kimi-k2.7-code",
        citationDocumentIds: [selected.id],
        metadata: expect.objectContaining({
          selectedDocumentId: selected.id,
          contextPartial: false,
        }),
      }),
    );
  });

  it("answers direct current-document questions even when embedding index config would fail", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Saved Title",
      contentMarkdown: "Saved content",
    });
    vi.mocked(assertCurrentEmbeddingIndex).mockImplementationOnce(() => {
      throw new Error("EMBEDDING_INDEX_INCOMPATIBLE");
    });

    const result = await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "What happened?",
    });

    expect(result.answer).toBe("Saved answer");
    expect(assertCurrentEmbeddingIndex).not.toHaveBeenCalled();
    expect(safeIndexSavedDocument).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
    expect(searchSimilarChunks).not.toHaveBeenCalled();
    expect(createChatModel).toHaveBeenCalled();
    expect(invokeAnswerChain).toHaveBeenCalled();
  });

  it("does not require valid embedding env for direct current-document answers", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Saved Title",
      contentMarkdown: "Saved content",
    });
    vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", "768");

    const result = await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "What happened?",
    });

    expect(result.answer).toBe("Saved answer");
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.not.objectContaining({
        embeddingProvider: expect.anything(),
        embeddingModel: expect.anything(),
        embeddingDimensions: expect.anything(),
      }),
    );
    expect(createChatModel).toHaveBeenCalled();
    expect(invokeAnswerChain).toHaveBeenCalled();
  });

  it("returns no citations and no citation ids for an empty current document", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Empty",
      contentMarkdown: "   \n",
    });

    const result = await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "What is here?",
    });

    expect(result.citations).toEqual([]);
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        citationDocumentIds: [],
        metadata: expect.objectContaining({
          selectedDocumentId: selected.id,
          contextPartial: false,
        }),
      }),
    );
  });

  it("does not load linked document context for direct document answers", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const originalFindMany = prisma.documentLink.findMany.bind(prisma.documentLink);
    const linkFindMany = vi
      .spyOn(prisma.documentLink, "findMany")
      .mockImplementation((args) => originalFindMany(args));
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Selected",
      contentMarkdown: "[[Linked]]",
    });
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Linked",
      contentMarkdown: "Linked content",
    });

    await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "What is linked?",
    });

    expect(linkFindMany).not.toHaveBeenCalled();
    expect(safeIndexSavedDocument).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
    expect(searchSimilarChunks).not.toHaveBeenCalled();
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("[[Linked]]"),
      }),
    );
    expect(invokeAnswerChain).not.toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Linked content"),
      }),
    );
  });
});

async function createSavedDocument(input: {
  workspaceId: string;
  userId: string;
  id?: string;
  title: string;
  contentMarkdown: string;
}) {
  const id = input.id ?? randomUUID();
  const slug = input.title.toLowerCase().replace(/\s+/g, "-");

  return prisma.document.create({
    data: {
      id,
      workspaceId: input.workspaceId,
      title: input.title,
      slug,
      path: `/${slug}`,
      contentMarkdown: input.contentMarkdown,
      contentText: input.contentMarkdown,
      createdById: input.userId,
      updatedById: input.userId,
    },
  });
}
