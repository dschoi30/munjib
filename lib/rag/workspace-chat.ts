import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { invokeAnswerChain, type ChatModelLike } from "@/lib/rag/answer-chain";
import { getRagModelConfig } from "@/lib/rag/config";
import { assertCurrentEmbeddingIndex, embedText } from "@/lib/rag/embedding-client";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { buildRagPrompt } from "@/lib/rag/prompt";
import { searchSimilarChunks, type RetrievedChunk } from "@/lib/rag/vector-store";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { filterReadableDocuments } from "@/lib/workspace-tree";

export const WORKSPACE_CHAT_ERROR_CODES = {
  MESSAGE_REQUIRED: "MESSAGE_REQUIRED",
  THREAD_ARCHIVED: "THREAD_ARCHIVED",
} as const;

export type WorkspaceChatInput = {
  workspaceSlug: string;
  actorId: string;
};

export type SendWorkspaceChatMessageInput = WorkspaceChatInput & {
  message: string;
  selectedDocumentId?: string | null;
};

const RECENT_MESSAGE_LIMIT = 12;
const THREAD_MESSAGE_LIMIT = 50;
const RETRIEVAL_LIMIT = 60;
const PROMPT_CHUNK_LIMIT = 12;
const MAX_CHUNKS_PER_DOCUMENT = 3;

export async function getOrCreateWorkspaceChatThread(input: WorkspaceChatInput) {
  const workspace = await loadWorkspaceForChat(input);
  const thread = await getOrCreateActiveThread({
    workspaceId: workspace.id,
    actorId: input.actorId,
  });

  return {
    thread: withDisplayOrderedMessages(thread),
    messages: orderedMessagesForDisplay(thread.messages),
  };
}

export async function sendWorkspaceChatMessage(input: SendWorkspaceChatMessageInput) {
  const message = input.message.trim();
  if (!message) throw new Error(WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED);

  const workspace = await loadWorkspaceForChat(input);
  const thread = await getOrCreateActiveThread({
    workspaceId: workspace.id,
    actorId: input.actorId,
  });
  const userMessage = await prisma.aiChatMessage.create({
    data: {
      threadId: thread.id,
      role: "USER",
      content: message,
    },
  });

  const modelConfig = getRagModelConfig();
  assertCurrentEmbeddingIndex(modelConfig);

  const embedding = await embedText(message, { config: modelConfig });
  const readableDocumentIds = workspace.readableDocuments.map((document) => document.id);
  const selectedDocumentId = readableDocumentIds.includes(input.selectedDocumentId ?? "")
    ? input.selectedDocumentId
    : undefined;
  const chunks = await searchSimilarChunks({
    workspaceId: workspace.id,
    embeddingModel: modelConfig.embedding.indexId,
    embedding,
    readableDocumentIds,
    limit: RETRIEVAL_LIMIT,
  });
  const promptChunks = capPromptChunks(chunks);
  const prompt = buildRagPrompt({
    question: buildConversationQuestion(orderedMessagesForDisplay(thread.messages), message),
    chunks: promptChunks,
  });
  const citationChunkIds = promptChunks.map((chunk) => chunk.id);
  const trace = createLangfuseCallbackConfig({
    enabled: modelConfig.langfuse.enabled,
    captureMode: modelConfig.langfuse.captureMode,
    operation: "rag.workspace_chat",
    chatProvider: modelConfig.chat.provider,
    chatModel: modelConfig.chat.model,
    embeddingProvider: modelConfig.embedding.provider,
    embeddingModel: modelConfig.embedding.indexId,
    embeddingDimensions: modelConfig.embedding.dimensions,
    retrievedChunkCount: promptChunks.length,
    citationDocumentIds: prompt.citations.map((citation) => citation.documentId),
    citationChunkIds,
    metadata: {
      workspaceSlug: input.workspaceSlug,
      workspaceId: workspace.id,
      threadId: thread.id,
      actorId: input.actorId,
      ...(selectedDocumentId ? { selectedDocumentId } : {}),
    },
  });
  const answer = await invokeAnswerChain({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    chatModel: createChatModel(modelConfig.chat) as ChatModelLike,
    callbacks: trace.callbacks,
    metadata: trace.metadata,
  });
  const contextMeta = {
    retrievedChunkCount: promptChunks.length,
    citationChunkIds,
  };
  const { assistantMessage, updatedThread } = await prisma.$transaction(async (tx) => {
    const activeThread = await tx.aiChatThread.updateMany({
      where: { id: thread.id, status: "ACTIVE" },
      data: { lastMessageAt: new Date() },
    });
    if (activeThread.count === 0) {
      throw new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED);
    }

    const persistedAssistantMessage = await tx.aiChatMessage.create({
      data: {
        threadId: thread.id,
        role: "ASSISTANT",
        content: answer,
        citations: prompt.citations as Prisma.InputJsonValue,
        contextMeta,
        model: modelConfig.chat.model,
      },
    });
    const persistedThread = await tx.aiChatThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: persistedAssistantMessage.createdAt },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: THREAD_MESSAGE_LIMIT,
        },
      },
    });

    return {
      assistantMessage: persistedAssistantMessage,
      updatedThread: persistedThread,
    };
  });

  return {
    thread: withDisplayOrderedMessages(updatedThread),
    userMessage,
    assistantMessage,
    citations: prompt.citations,
  };
}

export async function resetWorkspaceChatThread(input: WorkspaceChatInput) {
  const workspace = await loadWorkspaceForChat(input);
  const activeThread = await findActiveThread({
    workspaceId: workspace.id,
    actorId: input.actorId,
  });

  if (!activeThread) return { thread: null };

  const thread = await prisma.aiChatThread.update({
    where: { id: activeThread.id },
    data: { status: "ARCHIVED" },
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: THREAD_MESSAGE_LIMIT,
      },
    },
  });

  return { thread: withDisplayOrderedMessages(thread) };
}

async function loadWorkspaceForChat(input: WorkspaceChatInput) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: input.workspaceSlug },
    include: {
      members: { where: { userId: input.actorId }, take: 1 },
      documents: {
        where: { status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!workspace || !workspace.members[0]) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }

  const documentIds = workspace.documents.map((document) => document.id);
  const [documentsWithExplicitPermissions, userDocumentPermissions] =
    documentIds.length > 0
      ? await Promise.all([
          prisma.permission.findMany({
            where: { resourceType: "DOCUMENT", resourceId: { in: documentIds } },
            distinct: ["resourceId"],
            select: { resourceId: true },
          }),
          prisma.permission.findMany({
            where: {
              resourceType: "DOCUMENT",
              resourceId: { in: documentIds },
              subjectType: "USER",
              subjectId: input.actorId,
            },
            select: { resourceId: true, permission: true },
          }),
        ])
      : [[], []];
  const explicitDocumentIds = new Set(
    documentsWithExplicitPermissions.map((permission) => permission.resourceId),
  );
  const permissionsByDocumentId = new Map<string, typeof userDocumentPermissions>();
  for (const permission of userDocumentPermissions) {
    const permissions = permissionsByDocumentId.get(permission.resourceId) ?? [];
    permissions.push(permission);
    permissionsByDocumentId.set(permission.resourceId, permissions);
  }
  const userPermissionsByDocumentId = new Map(
    documentIds.map((documentId) => [
      documentId,
      highestPermissionLevel(
        (permissionsByDocumentId.get(documentId) ?? []).map(
          (permission) => permission.permission,
        ),
      ),
    ]),
  );
  const readableDocuments = filterReadableDocuments({
    documents: workspace.documents,
    role: workspace.members[0].role,
    explicitDocumentIds,
    userPermissionsByDocumentId,
  });

  return {
    ...workspace,
    readableDocuments,
  };
}

async function getOrCreateActiveThread(input: { workspaceId: string; actorId: string }) {
  const existing = await findActiveThread(input);
  if (existing) return existing;

  try {
    return await prisma.aiChatThread.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.actorId,
      },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: THREAD_MESSAGE_LIMIT,
        },
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    const racedThread = await findActiveThread(input);
    if (!racedThread) {
      throw error;
    }
    return racedThread;
  }
}

async function findActiveThread(input: { workspaceId: string; actorId: string }) {
  return prisma.aiChatThread.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.actorId,
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: THREAD_MESSAGE_LIMIT,
      },
    },
  });
}

function capPromptChunks(chunks: RetrievedChunk[]) {
  const countsByDocumentId = new Map<string, number>();
  const capped: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const count = countsByDocumentId.get(chunk.documentId) ?? 0;
    if (count >= MAX_CHUNKS_PER_DOCUMENT) continue;

    countsByDocumentId.set(chunk.documentId, count + 1);
    capped.push(chunk);

    if (capped.length >= PROMPT_CHUNK_LIMIT) break;
  }

  return capped;
}

function withDisplayOrderedMessages<TThread extends { messages: Array<{ createdAt: Date }> }>(
  thread: TThread,
) {
  return {
    ...thread,
    messages: orderedMessagesForDisplay(thread.messages),
  };
}

function orderedMessagesForDisplay<TMessage extends { createdAt: Date; id?: string }>(
  messages: TMessage[],
) {
  return [...messages].sort((left, right) => {
    const createdAtDiff = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;

    return (left.id ?? "").localeCompare(right.id ?? "");
  });
}

function buildConversationQuestion(
  messages: Array<{ role: string; content: string }>,
  currentMessage: string,
) {
  const recentMessages = messages.slice(-RECENT_MESSAGE_LIMIT);
  if (recentMessages.length === 0) return currentMessage;

  return [
    "Recent conversation:",
    ...recentMessages.map((message) => `${message.role}: ${message.content}`),
    "",
    `Current user message: ${currentMessage}`,
  ].join("\n");
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
