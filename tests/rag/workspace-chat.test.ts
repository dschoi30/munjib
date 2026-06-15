import { randomUUID } from "node:crypto";
import { WorkspaceRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { invokeAnswerChain } from "@/lib/rag/answer-chain";
import { assertCurrentEmbeddingIndex, embedText } from "@/lib/rag/embedding-client";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import {
  getOrCreateWorkspaceChatThread,
  resetWorkspaceChatThread,
  sendWorkspaceChatMessage,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

const chatModel = { invoke: vi.fn() };

vi.mock("@/lib/rag/embedding-client", () => ({
  assertCurrentEmbeddingIndex: vi.fn(),
  embedText: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01)),
}));

vi.mock("@/lib/rag/model-factory", () => ({
  createChatModel: vi.fn(() => chatModel),
}));

vi.mock("@/lib/rag/answer-chain", () => ({
  invokeAnswerChain: vi.fn().mockResolvedValue("Workspace answer [1]."),
}));

vi.mock("@/lib/rag/langfuse", () => ({
  createLangfuseCallbackConfig: vi.fn(() => ({
    callbacks: [],
    metadata: {
      operation: "rag.workspace_chat",
      chatProvider: "ollama",
      chatModel: "gemma4:e4b",
      embeddingProvider: "ollama",
      embeddingModel: "bge-m3",
      embeddingDimensions: 1024,
    },
  })),
}));

vi.mock("@/lib/rag/vector-store", () => ({
  searchSimilarChunks: vi.fn().mockResolvedValue([]),
}));

describe("workspace chat service", () => {
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

  it("creates and reuses one active thread per user and workspace", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const first = await getOrCreateWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });
    const second = await getOrCreateWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });

    expect(second.thread.id).toBe(first.thread.id);
    expect(second.messages).toEqual([]);
    await expect(
      prisma.aiChatThread.count({
        where: {
          workspaceId: fixture.workspace.id,
          userId: fixture.user.id,
          status: "ACTIVE",
        },
      }),
    ).resolves.toBe(1);
  });

  it("saves the turn, searches readable chunks, invokes the answer chain, and persists answer metadata", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const handbook = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "# Policy\n\nWorkspace policy evidence.",
    });
    const runbook = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Deploy\n\nRollback evidence.",
    });
    await prisma.aiChatThread.create({
      data: {
        workspaceId: fixture.workspace.id,
        userId: fixture.user.id,
        messages: {
          create: [
            { role: "USER", content: "Earlier question?" },
            { role: "ASSISTANT", content: "Earlier answer." },
          ],
        },
      },
    });
    const returnedChunks = [
      ...makeChunks(handbook, 1, 4),
      ...makeChunks(runbook, 5, 4),
      ...makeChunks(
        await createSavedDocument({
          workspaceId: fixture.workspace.id,
          userId: fixture.user.id,
          title: "Guide",
          contentMarkdown: "# Guide\n\nGuide evidence.",
        }),
        9,
        4,
      ),
      ...makeChunks(
        await createSavedDocument({
          workspaceId: fixture.workspace.id,
          userId: fixture.user.id,
          title: "Notes",
          contentMarkdown: "# Notes\n\nNotes evidence.",
        }),
        13,
        2,
      ),
    ];
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce(returnedChunks);

    const result = await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "  What is the workspace policy?  ",
      selectedDocumentId: handbook.id,
    });

    expect(result.assistantMessage.content).toBe("Workspace answer [1].");
    expect(result.thread.lastMessageAt).toBeInstanceOf(Date);
    expect(assertCurrentEmbeddingIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: expect.objectContaining({ indexId: "bge-m3" }),
      }),
    );
    expect(embedText).toHaveBeenCalledWith(
      "What is the workspace policy?",
      expect.objectContaining({
        config: expect.objectContaining({
          embedding: expect.objectContaining({
            provider: "ollama",
            model: "bge-m3",
            dimensions: 1024,
          }),
        }),
      }),
    );
    expect(searchSimilarChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: fixture.workspace.id,
        embeddingModel: "bge-m3",
        readableDocumentIds: expect.arrayContaining([handbook.id, runbook.id]),
        limit: 60,
      }),
    );
    expect(createChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        model: "gemma4:e4b",
        baseUrl: "http://localhost:11434",
      }),
    );
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "rag.workspace_chat",
        chatProvider: "ollama",
        chatModel: "gemma4:e4b",
        embeddingProvider: "ollama",
        embeddingModel: "bge-m3",
        embeddingDimensions: 1024,
        retrievedChunkCount: 11,
        citationDocumentIds: expect.arrayContaining([handbook.id, runbook.id]),
        citationChunkIds: returnedChunks
          .filter((chunk) => !["chunk-4", "chunk-8", "chunk-12"].includes(chunk.id))
          .map((chunk) => chunk.id),
        metadata: expect.objectContaining({
          workspaceSlug: fixture.workspace.slug,
          workspaceId: fixture.workspace.id,
          threadId: result.thread.id,
          actorId: fixture.user.id,
          selectedDocumentId: handbook.id,
        }),
      }),
    );
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Use only the saved document context"),
        userPrompt: expect.stringContaining("Recent conversation:"),
        chatModel,
        callbacks: [],
        metadata: expect.objectContaining({
          operation: "rag.workspace_chat",
          chatProvider: "ollama",
        }),
      }),
    );
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Earlier question?"),
      }),
    );
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("What is the workspace policy?"),
      }),
    );
    expect(invokeAnswerChain).not.toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Evidence 4"),
      }),
    );

    const messages = await prisma.aiChatMessage.findMany({
      where: { threadId: result.thread.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: result.userMessage.id,
          role: "USER",
          content: "What is the workspace policy?",
          citations: null,
          contextMeta: null,
          model: null,
        }),
        expect.objectContaining({
          id: result.assistantMessage.id,
          role: "ASSISTANT",
          content: "Workspace answer [1].",
          citations: result.citations,
          contextMeta: {
            retrievedChunkCount: 11,
            citationChunkIds: returnedChunks
              .filter((chunk) => !["chunk-4", "chunk-8", "chunk-12"].includes(chunk.id))
              .map((chunk) => chunk.id),
          },
          model: "gemma4:e4b",
        }),
      ]),
    );
  });

  it("uses a chat model override without changing the embedding index contract", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "Workspace evidence.",
    });

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "What should I know?",
      chatModelOverride: "google/gemma-4-31b-it:free",
    });

    expect(createChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        model: "google/gemma-4-31b-it:free",
        baseUrl: "http://localhost:11434",
      }),
    );
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        chatModel: "google/gemma-4-31b-it:free",
        embeddingProvider: "ollama",
        embeddingModel: "bge-m3",
        embeddingDimensions: 1024,
      }),
    );
    expect(assertCurrentEmbeddingIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: expect.objectContaining({ indexId: "bge-m3" }),
      }),
    );
  });

  it("prioritizes readable selected document chunks before capping prompt context", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const first = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "First",
      contentMarkdown: "First evidence.",
    });
    const second = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Second",
      contentMarkdown: "Second evidence.",
    });
    const third = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Third",
      contentMarkdown: "Third evidence.",
    });
    const fourth = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Fourth",
      contentMarkdown: "Fourth evidence.",
    });
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Selected",
      contentMarkdown: "Selected evidence.",
    });
    const returnedChunks = [
      ...makeChunks(first, 1, 3),
      ...makeChunks(second, 4, 3),
      ...makeChunks(third, 7, 3),
      ...makeChunks(fourth, 10, 3),
      ...makeChunks(selected, 13, 2),
    ];
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce(returnedChunks);

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Explain the open document",
      selectedDocumentId: selected.id,
    });

    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievedChunkCount: 12,
        citationChunkIds: expect.arrayContaining(["chunk-13", "chunk-14"]),
      }),
    );
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("[1] Selected > Evidence"),
      }),
    );
  });

  it("uses recent thread messages when building the conversation prompt", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "Workspace evidence.",
    });
    const startedAt = new Date("2026-06-15T00:00:00.000Z");
    await prisma.aiChatThread.create({
      data: {
        workspaceId: fixture.workspace.id,
        userId: fixture.user.id,
        messages: {
          create: Array.from({ length: 60 }, (_, index) => ({
            role: index % 2 === 0 ? "USER" : "ASSISTANT",
            content: `Historical message ${index + 1}`,
            createdAt: new Date(startedAt.getTime() + index * 1_000),
          })),
        },
      },
    });

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "What is newest?",
    });

    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Historical message 60"),
      }),
    );
    expect(invokeAnswerChain).not.toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Historical message 1"),
      }),
    );
  });

  it("does not save a delayed assistant response after the active thread is reset", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "Workspace evidence.",
    });
    let resolveAnswer: (answer: string) => void;
    const pendingAnswer = new Promise<string>((resolve) => {
      resolveAnswer = resolve;
    });
    vi.mocked(invokeAnswerChain).mockReturnValueOnce(pendingAnswer);

    const sendPromise = sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Answer slowly",
    });
    await vi.waitFor(() => {
      expect(invokeAnswerChain).toHaveBeenCalled();
    });

    const reset = await resetWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });
    resolveAnswer!("Late answer [1].");

    await expect(sendPromise).rejects.toThrow(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED);
    expect(reset.thread?.status).toBe("ARCHIVED");
    await expect(
      prisma.aiChatMessage.count({
        where: {
          threadId: reset.thread?.id,
          role: "ASSISTANT",
        },
      }),
    ).resolves.toBe(0);
  });

  it("filters unreadable active documents out of workspace retrieval", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const readable = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Readable",
      contentMarkdown: "Readable evidence.",
    });
    const restricted = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Restricted",
      contentMarkdown: "Restricted evidence.",
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

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "What can I read?",
      selectedDocumentId: restricted.id,
    });

    expect(searchSimilarChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        readableDocumentIds: [readable.id],
      }),
    );
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          selectedDocumentId: restricted.id,
        }),
      }),
    );
  });

  it("throws MESSAGE_REQUIRED for blank messages before creating a thread", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    await expect(
      sendWorkspaceChatMessage({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        message: "  \n\t  ",
      }),
    ).rejects.toThrow(WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED);
    await expect(
      prisma.aiChatThread.count({
        where: { workspaceId: fixture.workspace.id, userId: fixture.user.id },
      }),
    ).resolves.toBe(0);
  });

  it("requires workspace membership", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const outsider = await prisma.user.create({
      data: { email: `outsider-${randomUUID()}@example.com`, name: "Outsider" },
    });

    await expect(
      getOrCreateWorkspaceChatThread({
        workspaceSlug: fixture.workspace.slug,
        actorId: outsider.id,
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  });

  it("archives the active thread on reset", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const created = await getOrCreateWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });

    const result = await resetWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });

    expect(result?.thread?.id).toBe(created.thread.id);
    const archived = await prisma.aiChatThread.findUniqueOrThrow({
      where: { id: created.thread.id },
    });
    expect(archived.status).toBe("ARCHIVED");
    await expect(
      prisma.aiChatThread.count({
        where: {
          workspaceId: fixture.workspace.id,
          userId: fixture.user.id,
          status: "ACTIVE",
        },
      }),
    ).resolves.toBe(0);
  });
});

async function createSavedDocument(input: {
  workspaceId: string;
  userId: string;
  title: string;
  contentMarkdown: string;
}) {
  const id = randomUUID();
  const slug = input.title.toLowerCase().replace(/\s+/g, "-");

  return prisma.document.create({
    data: {
      id,
      workspaceId: input.workspaceId,
      title: input.title,
      slug,
      path: `/${slug}-${id}`,
      contentMarkdown: input.contentMarkdown,
      contentText: input.contentMarkdown,
      createdById: input.userId,
      updatedById: input.userId,
    },
  });
}

function makeChunks(
  document: { id: string; title: string; path: string },
  firstIndex: number,
  count: number,
) {
  return Array.from({ length: count }, (_, index) => {
    const chunkNumber = firstIndex + index;
    return {
      id: `chunk-${chunkNumber}`,
      documentId: document.id,
      documentTitle: document.title,
      documentPath: document.path,
      headingPath: "Evidence",
      content: `Evidence ${chunkNumber}`,
      distance: chunkNumber / 100,
    };
  });
}
