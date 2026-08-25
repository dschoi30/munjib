import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embedText } from "@/lib/rag/embedding-client";
import { streamAnswerChain } from "@/lib/rag/answer-chain";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import {
  preflightWorkspaceChatMessageStream,
  preparePreflightedWorkspaceChatMessageStream,
  sendPreparedWorkspaceChatMessageStream,
} from "@/lib/rag/workspace-chat";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

const db = vi.hoisted(() => ({
  workspaceFindFirst: vi.fn(),
  permissionFindMany: vi.fn(),
  aiChatThreadFindFirst: vi.fn(),
  aiChatThreadCreate: vi.fn(),
  aiChatMessageCreate: vi.fn(),
  documentChunkFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    workspace: { findFirst: db.workspaceFindFirst },
    permission: { findMany: db.permissionFindMany },
    aiChatThread: {
      findFirst: db.aiChatThreadFindFirst,
      create: db.aiChatThreadCreate,
    },
    aiChatMessage: { create: db.aiChatMessageCreate },
    documentChunk: { findMany: db.documentChunkFindMany },
    $transaction: db.transaction,
  },
}));

vi.mock("@/lib/rag/embedding-client", () => ({
  assertCurrentEmbeddingIndex: vi.fn(),
  embedText: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01)),
}));

vi.mock("@/lib/rag/index-document", () => ({
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rag/model-factory", () => ({
  createChatModel: vi.fn(() => ({ invoke: vi.fn() })),
}));

vi.mock("@/lib/rag/answer-chain", () => ({
  invokeAnswerChain: vi.fn(),
  streamAnswerChain: vi.fn().mockResolvedValue("Workspace answer [1]."),
}));

vi.mock("@/lib/rag/langfuse", () => ({
  createLangfuseCallbackConfig: vi.fn(() => ({
    callbacks: [],
    metadata: { operation: "rag.workspace_chat" },
  })),
}));

vi.mock("@/lib/rag/vector-store", () => ({
  searchSimilarChunks: vi.fn(),
}));

const demoDocument = {
  id: "document-demo-1",
  workspaceId: "workspace-demo-1",
  parentId: null,
  title: "Demo Handbook",
  slug: "demo-handbook",
  path: "/demo-handbook",
  icon: null,
  coverImage: null,
  contentMarkdown: "Public demo evidence.",
  contentText: "Public demo evidence.",
  status: "ACTIVE" as const,
  position: 0,
  createdById: "seed-user-1",
  updatedById: "seed-user-1",
  createdAt: new Date("2026-08-25T00:00:00.000Z"),
  updatedAt: new Date("2026-08-25T00:00:00.000Z"),
};

const principal = {
  kind: "anonymous-trial-demo" as const,
  capabilityId: "anonymous-trial-v1" as const,
  workspaceId: "workspace-demo-1",
  workspaceSlug: "company-handbook",
  access: "viewer-only" as const,
  trialVisitorSubject: "visitor-digest-1",
};

describe("anonymous Trial workspace chat service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", "ollama");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "gemma4:e4b");
    vi.stubEnv("MUNJIB_RAG_EMBED_PROVIDER", "ollama");
    vi.stubEnv("MUNJIB_RAG_EMBED_MODEL", "bge-m3");
    vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", "1024");
    vi.stubEnv("MUNJIB_LANGFUSE_CAPTURE_MODE", "full");
    db.workspaceFindFirst.mockImplementation(async (input) =>
      input.where.id === principal.workspaceId && input.where.slug === principal.workspaceSlug
        ? {
            id: principal.workspaceId,
            organizationId: "organization-demo-1",
            name: "Demo Workspace",
            slug: principal.workspaceSlug,
            visibility: "private",
            archivedDocumentRetentionPolicy: "DAYS_30",
            archivedAt: null,
            createdAt: new Date("2026-08-25T00:00:00.000Z"),
            updatedAt: new Date("2026-08-25T00:00:00.000Z"),
            documents: [demoDocument],
          }
        : null,
    );
    db.documentChunkFindMany.mockResolvedValue([]);
    db.permissionFindMany.mockResolvedValue([]);
    vi.mocked(searchSimilarChunks).mockResolvedValue([
      {
        id: "chunk-1",
        documentId: demoDocument.id,
        documentTitle: demoDocument.title,
        documentPath: demoDocument.path,
        headingPath: "Evidence",
        content: "Public demo evidence.",
        distance: 0.01,
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("excludes explicitly restricted demo documents without reading USER grants", async () => {
    db.permissionFindMany.mockResolvedValueOnce([{ resourceId: demoDocument.id }]);

    const preflight = await preflightWorkspaceChatMessageStream({
      workspaceSlug: principal.workspaceSlug,
      authorizationPrincipal: principal,
    });

    expect(preflight).toMatchObject({
      kind: "stateless-trial",
      workspaceId: principal.workspaceId,
      workspaceSlug: principal.workspaceSlug,
      readableDocuments: [],
    });
    expect(db.workspaceFindFirst).toHaveBeenCalledWith({
      where: {
        id: principal.workspaceId,
        slug: principal.workspaceSlug,
        archivedAt: null,
      },
      include: {
        documents: {
          where: { status: "ACTIVE" },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    expect(db.permissionFindMany).toHaveBeenCalledWith({
      where: {
        resourceType: "DOCUMENT",
        resourceId: { in: [demoDocument.id] },
      },
      distinct: ["resourceId"],
      select: { resourceId: true },
    });
    expect(db.permissionFindMany.mock.calls[0]?.[0]).not.toHaveProperty(
      "where.subjectType",
    );
    expect(db.permissionFindMany.mock.calls[0]?.[0]).not.toHaveProperty(
      "where.subjectId",
    );

    await expect(
      preflightWorkspaceChatMessageStream({
        workspaceSlug: principal.workspaceSlug,
        authorizationPrincipal: { ...principal, workspaceId: "workspace-other-1" },
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  });

  it("prepares and sends each anonymous Trial request without any thread or message persistence", async () => {
    const preflight = await preflightWorkspaceChatMessageStream({
      workspaceSlug: principal.workspaceSlug,
      authorizationPrincipal: principal,
    });
    const prepared = await preparePreflightedWorkspaceChatMessageStream({
      preflight,
      message: "  What is in this demo?  ",
    });
    const result = await sendPreparedWorkspaceChatMessageStream(prepared, {
      onToken: vi.fn(),
    });

    expect(prepared.kind).toBe("stateless-trial");
    expect(embedText).toHaveBeenCalledWith("What is in this demo?", expect.any(Object));
    expect(result).toMatchObject({
      assistantMessage: {
        role: "ASSISTANT",
        content: "Workspace answer [1].",
      },
    });
    expect(db.aiChatThreadFindFirst).not.toHaveBeenCalled();
    expect(db.aiChatThreadCreate).not.toHaveBeenCalled();
    expect(db.aiChatMessageCreate).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(streamAnswerChain).toHaveBeenCalledWith(
      expect.objectContaining({ privacySafeLogging: true }),
    );
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMode: "metadata",
        metadata: {
          workspaceSlug: principal.workspaceSlug,
          workspaceId: principal.workspaceId,
          anonymousTrial: true,
        },
      }),
    );
  });
});
