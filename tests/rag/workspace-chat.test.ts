import { randomUUID } from "node:crypto";
import { WorkspaceRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { INVALID_CHAT_MODEL_ERROR } from "@/lib/rag/client-model-settings";
import { invokeAnswerChain, streamAnswerChain } from "@/lib/rag/answer-chain";
import { assertCurrentEmbeddingIndex, embedText } from "@/lib/rag/embedding-client";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { safeIndexSavedDocument } from "@/lib/rag/index-document";
import {
  getOrCreateWorkspaceChatThread,
  prepareWorkspaceChatMessageStream,
  resetWorkspaceChatThread,
  sendPreparedWorkspaceChatMessageStream,
  sendWorkspaceChatMessage,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";
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
  streamAnswerChain: vi.fn().mockResolvedValue("Workspace answer [1]."),
}));

vi.mock("@/lib/rag/index-document", () => ({
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
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
    vi.mocked(invokeAnswerChain).mockReset();
    vi.mocked(invokeAnswerChain).mockResolvedValue("Workspace answer [1].");
    vi.mocked(streamAnswerChain).mockReset();
    vi.mocked(streamAnswerChain).mockResolvedValue("Workspace answer [1].");
    vi.mocked(safeIndexSavedDocument).mockReset();
    vi.mocked(safeIndexSavedDocument).mockResolvedValue(true);
    vi.mocked(searchSimilarChunks).mockReset();
    vi.mocked(searchSimilarChunks).mockResolvedValue([]);
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

  it("keeps user messages before assistant messages when persisted timestamps tie", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const tiedCreatedAt = new Date("2026-06-15T00:00:00.000Z");
    const idSuffix = randomUUID();
    await prisma.aiChatThread.create({
      data: {
        workspaceId: fixture.workspace.id,
        userId: fixture.user.id,
        messages: {
          create: [
            {
              id: `zz-user-message-${idSuffix}`,
              role: "USER",
              content: "Question with tied timestamp",
              createdAt: tiedCreatedAt,
            },
            {
              id: `aa-assistant-message-${idSuffix}`,
              role: "ASSISTANT",
              content: "Answer with tied timestamp",
              createdAt: tiedCreatedAt,
            },
          ],
        },
      },
    });

    const result = await getOrCreateWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });

    expect(result.messages.map((message) => message.role)).toEqual(["USER", "ASSISTANT"]);
    expect(result.thread.messages.map((message) => message.role)).toEqual([
      "USER",
      "ASSISTANT",
    ]);
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
    vi.mocked(invokeAnswerChain).mockResolvedValueOnce("Workspace answer [5].");

    const result = await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "  What is the workspace policy?  ",
      selectedDocumentId: handbook.id,
    });

    expect(result.assistantMessage.content).toBe("Workspace answer [1].");
    expect(result.citations).toEqual([
      {
        index: 1,
        documentId: runbook.id,
        documentTitle: "Runbook",
        documentPath: runbook.path,
        headingPath: "Evidence",
      },
    ]);
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
    expect(embedText).not.toHaveBeenCalledWith(
      expect.stringContaining("Earlier question?"),
      expect.any(Object),
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

  it("streams tokens for a prepared workspace chat turn and persists the normalized answer afterward", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const handbook = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "# Policy\n\nWorkspace policy evidence.",
    });
    const returnedChunks = makeChunks(handbook, 1, 2);
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce(returnedChunks);
    vi.mocked(streamAnswerChain).mockImplementationOnce(async (input) => {
      await input.onToken("Streaming");
      await input.onToken(" answer");
      await input.onToken(" [2].");
      return "Streaming answer [2].";
    });

    const prepared = await prepareWorkspaceChatMessageStream({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "  What is the workspace policy?  ",
    });
    await expect(
      prisma.aiChatMessage.count({
        where: {
          thread: {
            workspaceId: fixture.workspace.id,
            userId: fixture.user.id,
          },
        },
      }),
    ).resolves.toBe(0);
    const tokens: string[] = [];

    const result = await sendPreparedWorkspaceChatMessageStream(prepared, {
      onToken: (token) => {
        tokens.push(token);
      },
    });

    expect(tokens).toEqual(["Streaming", " answer", " [2]."]);
    expect(streamAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Use only the saved document context"),
        userPrompt: expect.stringContaining("What is the workspace policy?"),
        chatModel,
        callbacks: [],
        metadata: expect.objectContaining({
          operation: "rag.workspace_chat",
          chatProvider: "ollama",
        }),
        onToken: expect.any(Function),
      }),
    );
    expect(result.assistantMessage.content).toBe("Streaming answer [1].");
    expect(result.citations).toEqual([
      {
        index: 1,
        documentId: handbook.id,
        documentTitle: "Handbook",
        documentPath: handbook.path,
        headingPath: "Evidence",
      },
    ]);
    expect(result.assistantMessage.model).toBe("gemma4:e4b");
    expect(result.assistantMessage.contextMeta).toEqual({
      retrievedChunkCount: 2,
      citationChunkIds: ["chunk-1", "chunk-2"],
    });

    const messages = await prisma.aiChatMessage.findMany({
      where: { threadId: result.thread.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((message) => message.role)).toEqual(["USER", "ASSISTANT"]);
    expect(messages[0]).toMatchObject({
      content: "What is the workspace policy?",
      citations: null,
      contextMeta: null,
      model: null,
    });
    expect(messages[1]).toMatchObject({
      content: "Streaming answer [1].",
      citations: result.citations,
      contextMeta: {
        retrievedChunkCount: 2,
        citationChunkIds: ["chunk-1", "chunk-2"],
      },
      model: "gemma4:e4b",
    });
  });

  it("does not persist user or assistant messages when streaming fails after a partial token", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const handbook = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "# Policy\n\nWorkspace policy evidence.",
    });
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce(makeChunks(handbook, 1, 1));
    vi.mocked(streamAnswerChain).mockImplementationOnce(async (input) => {
      await input.onToken("Partial");
      throw new Error("stream failed");
    });
    const prepared = await prepareWorkspaceChatMessageStream({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Will this fail?",
    });
    const tokens: string[] = [];

    await expect(
      sendPreparedWorkspaceChatMessageStream(prepared, {
        onToken: (token) => {
          tokens.push(token);
        },
      }),
    ).rejects.toThrow("stream failed");

    expect(tokens).toEqual(["Partial"]);
    await expect(
      prisma.aiChatMessage.count({
        where: {
          thread: {
            workspaceId: fixture.workspace.id,
            userId: fixture.user.id,
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it("passes abort signals to streaming generation and skips persistence after abort", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const handbook = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "# Policy\n\nWorkspace policy evidence.",
    });
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce(makeChunks(handbook, 1, 1));
    const abortController = new AbortController();
    vi.mocked(streamAnswerChain).mockImplementationOnce(async () => {
      abortController.abort();
      return "Workspace answer [1].";
    });
    const prepared = await prepareWorkspaceChatMessageStream({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Will this abort?",
    });

    await expect(
      sendPreparedWorkspaceChatMessageStream(prepared, {
        onToken: vi.fn(),
        signal: abortController.signal,
      }),
    ).rejects.toThrow("WORKSPACE_CHAT_STREAM_ABORTED");

    expect(streamAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { signal: abortController.signal },
      }),
    );
    await expect(
      prisma.aiChatMessage.count({
        where: {
          thread: {
            workspaceId: fixture.workspace.id,
            userId: fixture.user.id,
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it("stops workspace chat preparation before expensive work when already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      prepareWorkspaceChatMessageStream({
        workspaceSlug: "company-handbook",
        actorId: "user-1",
        message: "Do not prepare this.",
        signal: abortController.signal,
      }),
    ).rejects.toThrow("WORKSPACE_CHAT_STREAM_ABORTED");

    expect(embedText).not.toHaveBeenCalled();
    expect(searchSimilarChunks).not.toHaveBeenCalled();
    expect(safeIndexSavedDocument).not.toHaveBeenCalled();
  });

  it("backfills lexically relevant readable documents before workspace retrieval", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const welcome = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Welcome",
      contentMarkdown: "# Welcome\n\nGeneral onboarding intro.",
    });
    const ptoPolicy = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "PTO Policy",
      contentMarkdown: "# PTO Exceptions\n\nPTO exception requests require manager approval.",
    });
    const security = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Security",
      contentMarkdown: "# Security\n\nRotate credentials every quarter.",
    });

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "How are PTO exception requests approved?",
      selectedDocumentId: welcome.id,
    });

    expect(safeIndexSavedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: ptoPolicy.id,
        embeddingModel: "bge-m3",
      }),
    );
    expect(safeIndexSavedDocument).not.toHaveBeenCalledWith(
      expect.objectContaining({ documentId: welcome.id }),
    );
    expect(safeIndexSavedDocument).not.toHaveBeenCalledWith(
      expect.objectContaining({ documentId: security.id }),
    );
    expect(
      vi.mocked(safeIndexSavedDocument).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(searchSimilarChunks).mock.invocationCallOrder[0] ?? 0);
  });

  it("stops before retrieval, generation, and message persistence when a required index refresh fails", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Policy",
      contentMarkdown: "# Policy\n\nManager approval is required.",
    });
    vi.mocked(safeIndexSavedDocument).mockResolvedValue(false);

    await expect(sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Explain the policy",
    })).rejects.toThrow(RAG_ERROR_CODES.INDEXING_FAILED);

    expect(embedText).not.toHaveBeenCalled();
    expect(searchSimilarChunks).not.toHaveBeenCalled();
    expect(invokeAnswerChain).not.toHaveBeenCalled();
    expect(await prisma.aiChatMessage.count({
      where: { thread: { workspaceId: fixture.workspace.id } },
    })).toBe(0);
  });

  it("keeps the current topic in backfill and vector retrieval after a long answer about another topic", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const historyTerms = "Munjib workspace documents permissions attachments Markdown graph wiki";
    await Promise.all(Array.from({ length: 9 }, (_, index) => createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: `Munjib ${index}`,
      contentMarkdown: historyTerms,
    })));
    const civilWar = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "미국_남북전쟁".normalize("NFD"),
      contentMarkdown: "# 미국 남북전쟁\n\n연방 유지와 노예제 폐지.",
    });
    await prisma.aiChatThread.create({ data: {
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      messages: { create: [
        { role: "USER", content: "Munjib의 기능은?" },
        { role: "ASSISTANT", content: historyTerms },
      ] },
    } });

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "미국 남북전쟁 의의",
      selectedDocumentId: civilWar.id,
    });

    expect(safeIndexSavedDocument).toHaveBeenCalledTimes(1);
    expect(safeIndexSavedDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: civilWar.id }));
    expect(embedText).toHaveBeenCalledWith("미국 남북전쟁 의의", expect.any(Object));
    expect(invokeAnswerChain).toHaveBeenCalledWith(expect.objectContaining({
      userPrompt: expect.stringContaining(historyTerms),
    }));
  });

  it("retains a relevant open document even when eight documents have higher current-question scores", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Policy",
      contentMarkdown: "# Policy\n\nManager approval.",
    });
    await Promise.all(Array.from({ length: 9 }, (_, index) => createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: `Policy approval manager ${index}`,
      contentMarkdown: "Policy approval manager evidence.",
    })));

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Policy approval manager",
      selectedDocumentId: selected.id,
    });

    expect(safeIndexSavedDocument).toHaveBeenCalledTimes(8);
    expect(safeIndexSavedDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: selected.id }));
  });

  it("backfills the readable selected document for document-referential prompts", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Welcome",
      contentMarkdown: "# Welcome\n\nSelected document evidence.",
    });
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Security",
      contentMarkdown: "# Security\n\nRotate credentials every quarter.",
    });

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Summarize this document.",
      selectedDocumentId: selected.id,
    });

    expect(safeIndexSavedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: selected.id,
        embeddingModel: "bge-m3",
      }),
    );
  });

  it("backfills the readable selected document even when lexical candidates fill the cap", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Selected",
      contentMarkdown: "# Selected\n\nSelected document evidence.",
    });
    await Promise.all(
      Array.from({ length: 9 }, (_, index) =>
        createSavedDocument({
          workspaceId: fixture.workspace.id,
          userId: fixture.user.id,
          title: `Summarize Candidate ${index + 1}`,
          contentMarkdown: "# Candidate\n\nSummarize candidate evidence.",
        }),
      ),
    );

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Summarize this document.",
      selectedDocumentId: selected.id,
    });

    expect(safeIndexSavedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: selected.id,
        embeddingModel: "bge-m3",
      }),
    );
  });

  it("uses an OpenAI-compatible chat model override without changing the embedding index contract", async () => {
    vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", "openai-compatible");
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_BASE_URL", "https://openrouter.ai/api/v1");
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
        provider: "openai-compatible",
        model: "google/gemma-4-31b-it:free",
        baseUrl: "https://openrouter.ai/api/v1",
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

  it("retrieves readable selected document chunks separately before the global cap", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const noise = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Noise",
      contentMarkdown: "Lots of similar workspace evidence.",
    });
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Selected",
      contentMarkdown: "Selected evidence.",
    });
    const globalChunks = makeChunks(noise, 1, 60);
    const selectedChunks = makeChunks(selected, 61, 2).map((chunk, index) => ({
      ...chunk,
      distance: 0.08 + index / 100,
    }));
    vi.mocked(searchSimilarChunks)
      .mockResolvedValueOnce(globalChunks)
      .mockResolvedValueOnce(selectedChunks);

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Explain the open document",
      selectedDocumentId: selected.id,
    });

    expect(searchSimilarChunks).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        readableDocumentIds: [selected.id],
        limit: 12,
      }),
    );
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("[1] Selected > Evidence"),
      }),
    );
  });

  it("does not promote selected document chunks when they are much less relevant", async () => {
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
      ...makeChunks(selected, 13, 2).map((chunk) => ({ ...chunk, distance: 0.95 })),
    ];
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce(returnedChunks);

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "Explain the relevant policy",
      selectedDocumentId: selected.id,
    });

    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        citationChunkIds: expect.not.arrayContaining(["chunk-13", "chunk-14"]),
      }),
    );
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.not.stringContaining("Selected > Evidence"),
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

    expect(embedText).toHaveBeenCalledWith(
      expect.stringContaining("Historical message 60"),
      expect.any(Object),
    );
    expect(embedText).toHaveBeenCalledWith(
      expect.stringContaining("Current user message: What is newest?"),
      expect.any(Object),
    );
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

  it("summarizes oversized conversation history into persistent thread memory before retrieval", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "Workspace evidence.",
    });
    vi.mocked(invokeAnswerChain).mockImplementation(async (input) =>
      input.systemPrompt.includes("conversation memory summarizer")
        ? "Memory summary: the user asked about PTO approvals and the assistant explained manager approval requirements."
        : "Workspace answer [1].",
    );
    await prisma.aiChatThread.create({
      data: {
        workspaceId: fixture.workspace.id,
        userId: fixture.user.id,
        messages: {
          create: Array.from({ length: 12 }, (_, index) => ({
            role: index % 2 === 0 ? "USER" : "ASSISTANT",
            content: `Long historical message ${index + 1}: ${"very long context ".repeat(80)}`,
          })),
        },
      },
    });

    const result = await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "What is the policy now?",
    });

    const retrievalQuery = vi.mocked(embedText).mock.calls[0][0];
    expect(retrievalQuery.length).toBeLessThanOrEqual(6_000);
    expect(retrievalQuery).toContain("Conversation memory summary:");
    expect(retrievalQuery).toContain("PTO approvals");
    expect(retrievalQuery).toContain("Current user message: What is the policy now?");
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("conversation memory summarizer"),
        userPrompt: expect.stringContaining("Long historical message"),
      }),
    );
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Conversation memory summary:"),
      }),
    );
    const memoryRows = await prisma.$queryRaw<Array<{ memorySummary: string | null }>>`
      SELECT "memorySummary" FROM "AiChatThread" WHERE "id" = ${result.thread.id}
    `;
    expect(memoryRows[0]?.memorySummary).toContain("PTO approvals");
  });

  it("uses existing thread memory without resummarizing already summarized history", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "Workspace evidence.",
    });
    await prisma.aiChatThread.create({
      data: {
        workspaceId: fixture.workspace.id,
        userId: fixture.user.id,
        memorySummary: "Memory summary: PTO approvals require manager review.",
        memoryUpdatedAt: new Date("2026-06-17T00:00:00.000Z"),
        messages: {
          create: Array.from({ length: 12 }, (_, index) => ({
            role: index % 2 === 0 ? "USER" : "ASSISTANT",
            content: `Already summarized historical message ${index + 1}: ${"very long context ".repeat(80)}`,
            createdAt: new Date("2026-06-16T23:00:00.000Z"),
          })),
        },
      },
    });
    vi.mocked(invokeAnswerChain).mockImplementation(async (input) => {
      if (input.systemPrompt.includes("conversation memory summarizer")) {
        throw new Error("summary should not refresh");
      }
      return "Workspace answer [1].";
    });

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "What is the policy now?",
    });

    const retrievalQuery = vi.mocked(embedText).mock.calls[0][0];
    expect(retrievalQuery.length).toBeLessThanOrEqual(6_000);
    expect(retrievalQuery).toContain("Conversation memory summary:");
    expect(retrievalQuery).toContain("PTO approvals require manager review");
    expect(invokeAnswerChain).not.toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("conversation memory summarizer"),
      }),
    );
  });

  it("strips old citation markers from conversation history before retrieval and prompting", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "Workspace evidence.",
    });
    await prisma.aiChatThread.create({
      data: {
        workspaceId: fixture.workspace.id,
        userId: fixture.user.id,
        messages: {
          create: [
            { role: "USER", content: "Earlier question?" },
            {
              role: "ASSISTANT",
              content: "Earlier answer [1] and another citation [12].",
            },
          ],
        },
      },
    });

    await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "What changed?",
    });

    const retrievalQuery = vi.mocked(embedText).mock.calls[0][0];
    expect(retrievalQuery).toContain("Earlier answer and another citation.");
    expect(retrievalQuery).not.toContain("Earlier answer [1]");
    expect(retrievalQuery).not.toContain("[12]");
    expect(invokeAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Earlier answer and another citation."),
      }),
    );
    expect(invokeAnswerChain).not.toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Earlier answer [1]"),
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

  it("does not persist an orphan user message when answer generation fails", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "Workspace evidence.",
    });
    vi.mocked(invokeAnswerChain).mockRejectedValueOnce(new Error("provider down"));

    await expect(
      sendWorkspaceChatMessage({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        message: "Will this fail?",
      }),
    ).rejects.toThrow("provider down");

    await expect(
      prisma.aiChatMessage.count({
        where: {
          thread: {
            workspaceId: fixture.workspace.id,
            userId: fixture.user.id,
          },
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

  it("rejects archived workspaces without creating a chat thread", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedAt: new Date("2026-07-07T00:00:00.000Z") },
    });

    await expect(
      sendWorkspaceChatMessage({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        message: "Can I still chat?",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
    await expect(
      prisma.aiChatThread.count({
        where: { workspaceId: fixture.workspace.id, userId: fixture.user.id },
      }),
    ).resolves.toBe(0);
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

  it("overrides the chat provider and model for OpenAI-compatible workspace answers", async () => {
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_BASE_URL", "https://openrouter.ai/api/v1");
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
      chatProviderOverride: "openai-compatible",
      chatModelOverride: "openai/gpt-oss-20b:free",
    });

    expect(createChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai-compatible",
        model: "openai/gpt-oss-20b:free",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
    );
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        chatProvider: "openai-compatible",
        chatModel: "openai/gpt-oss-20b:free",
      }),
    );
  });

  it("uses a complete provider override without requiring the default provider config", async () => {
    vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", "openai-compatible");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "google/gemma-4-31b-it:free");
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_BASE_URL", "");
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
      chatProviderOverride: "ollama",
      chatModelOverride: "gemma4:e4b",
    });

    expect(createChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        model: "gemma4:e4b",
        baseUrl: "http://localhost:11434",
      }),
    );
  });

  it("rejects known OpenRouter-style chat model overrides when the server chat provider is Ollama", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Handbook",
      contentMarkdown: "Workspace evidence.",
    });

    await expect(
      sendWorkspaceChatMessage({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        message: "What should I know?",
        chatModelOverride: "google/gemma-4-31b-it:free",
      }),
    ).rejects.toThrow(INVALID_CHAT_MODEL_ERROR);

    expect(createChatModel).not.toHaveBeenCalled();
    expect(invokeAnswerChain).not.toHaveBeenCalled();
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
