import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { invokeAnswerChain, type ChatModelLike } from "@/lib/rag/answer-chain";
import { getRagModelConfig } from "@/lib/rag/config";
import { assertCurrentEmbeddingIndex, embedText } from "@/lib/rag/embedding-client";
import { safeIndexSavedDocument } from "@/lib/rag/index-document";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { buildRagPrompt, filterCitationsToAnswer } from "@/lib/rag/prompt";
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
  chatModelOverride?: string;
};

const RECENT_MESSAGE_LIMIT = 12;
const THREAD_MESSAGE_LIMIT = 50;
const RETRIEVAL_LIMIT = 60;
const PROMPT_CHUNK_LIMIT = 12;
const MAX_CHUNKS_PER_DOCUMENT = 3;
const INDEX_BACKFILL_DOCUMENT_LIMIT = 8;
const SELECTED_DOCUMENT_PRIORITY_DISTANCE_MARGIN = 0.15;
const WORKSPACE_CHAT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "could",
  "current",
  "document",
  "explain",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "please",
  "should",
  "tell",
  "that",
  "the",
  "then",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "would",
  "you",
  "your",
]);

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
  const effectiveModelConfig = input.chatModelOverride
    ? {
        ...modelConfig,
        chat: {
          ...modelConfig.chat,
          model: input.chatModelOverride,
        },
      }
    : modelConfig;
  assertCurrentEmbeddingIndex(effectiveModelConfig);

  const conversationQuestion = buildConversationQuestion(
    orderedMessagesForDisplay(thread.messages),
    message,
  );
  const readableDocumentIds = workspace.readableDocuments.map((document) => document.id);
  const selectedDocumentId = readableDocumentIds.includes(input.selectedDocumentId ?? "")
    ? input.selectedDocumentId
    : undefined;
  await ensureWorkspaceChatRetrievalIndex({
    workspaceId: workspace.id,
    readableDocuments: workspace.readableDocuments,
    query: conversationQuestion,
    embeddingModel: effectiveModelConfig.embedding.indexId,
  });
  const embedding = await embedText(conversationQuestion, { config: effectiveModelConfig });
  const chunks = await searchSimilarChunks({
    workspaceId: workspace.id,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    embedding,
    readableDocumentIds,
    limit: RETRIEVAL_LIMIT,
  });
  const promptChunks = capPromptChunks(prioritizeSelectedDocumentChunks(chunks, selectedDocumentId));
  const prompt = buildRagPrompt({
    question: conversationQuestion,
    chunks: promptChunks,
  });
  const citationChunkIds = promptChunks.map((chunk) => chunk.id);
  const trace = createLangfuseCallbackConfig({
    enabled: effectiveModelConfig.langfuse.enabled,
    captureMode: effectiveModelConfig.langfuse.captureMode,
    operation: "rag.workspace_chat",
    chatProvider: effectiveModelConfig.chat.provider,
    chatModel: effectiveModelConfig.chat.model,
    embeddingProvider: effectiveModelConfig.embedding.provider,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    embeddingDimensions: effectiveModelConfig.embedding.dimensions,
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
    chatModel: createChatModel(effectiveModelConfig.chat) as ChatModelLike,
    callbacks: trace.callbacks,
    metadata: trace.metadata,
  });
  const answerCitations = filterCitationsToAnswer(answer, prompt.citations);
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
        citations: answerCitations as Prisma.InputJsonValue,
        contextMeta,
        model: effectiveModelConfig.chat.model,
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
    citations: answerCitations,
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

async function ensureWorkspaceChatRetrievalIndex(input: {
  workspaceId: string;
  readableDocuments: Array<{
    id: string;
    title: string;
    path: string;
    contentMarkdown: string;
    contentText: string;
    updatedAt: Date;
  }>;
  query: string;
  embeddingModel: string;
}) {
  const candidates = selectIndexBackfillDocuments({
    documents: input.readableDocuments,
    query: input.query,
  });
  if (candidates.length === 0) return;

  const documentIds = candidates.map((document) => document.id);
  const freshChunkRows = await prisma.documentChunk.findMany({
    where: {
      workspaceId: input.workspaceId,
      embeddingModel: input.embeddingModel,
      documentId: { in: documentIds },
    },
    select: {
      documentId: true,
      sourceUpdatedAt: true,
    },
  });
  const freshDocumentIds = new Set(
    freshChunkRows
      .filter((chunk) => {
        const candidate = candidates.find((document) => document.id === chunk.documentId);
        return candidate && chunk.sourceUpdatedAt.getTime() === candidate.updatedAt.getTime();
      })
      .map((chunk) => chunk.documentId),
  );

  for (const document of candidates) {
    if (freshDocumentIds.has(document.id)) continue;

    await safeIndexSavedDocument({
      documentId: document.id,
      embeddingModel: input.embeddingModel,
    });
  }
}

function selectIndexBackfillDocuments(input: {
  documents: Array<{
    id: string;
    title: string;
    path: string;
    contentMarkdown: string;
    contentText: string;
    updatedAt: Date;
  }>;
  query: string;
}) {
  const queryTerms = normalizedKeywordTerms(input.query);
  if (queryTerms.size === 0) return [];

  return input.documents
    .map((document, order) => ({
      document,
      order,
      score: scoreDocumentForBackfill(document, queryTerms),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.order - right.order;
    })
    .slice(0, INDEX_BACKFILL_DOCUMENT_LIMIT)
    .map((candidate) => candidate.document);
}

function scoreDocumentForBackfill(
  document: {
    title: string;
    path: string;
    contentMarkdown: string;
    contentText: string;
  },
  queryTerms: Set<string>,
) {
  const titleTerms = normalizedKeywordTerms(document.title);
  const pathTerms = normalizedKeywordTerms(document.path);
  const contentTerms = normalizedKeywordTerms(document.contentText || document.contentMarkdown);
  let score = 0;

  for (const term of queryTerms) {
    if (titleTerms.has(term)) score += 5;
    if (pathTerms.has(term)) score += 4;
    if (contentTerms.has(term)) score += 1;
  }

  return score;
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

function prioritizeSelectedDocumentChunks(
  chunks: RetrievedChunk[],
  selectedDocumentId: string | null | undefined,
) {
  if (!selectedDocumentId) return chunks;
  const bestDistance = Math.min(...chunks.map((chunk) => chunk.distance));
  const selectedPriorityMaxDistance = bestDistance + SELECTED_DOCUMENT_PRIORITY_DISTANCE_MARGIN;

  return chunks
    .map((chunk, index) => ({
      chunk,
      index,
      isPrioritySelectedDocument:
        chunk.documentId === selectedDocumentId &&
        Number.isFinite(chunk.distance) &&
        chunk.distance <= selectedPriorityMaxDistance,
    }))
    .sort((left, right) => {
      if (left.isPrioritySelectedDocument !== right.isPrioritySelectedDocument) {
        return left.isPrioritySelectedDocument ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.chunk);
}

function normalizedKeywordTerms(text: string) {
  const tokens = text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(tokens.filter(isKeywordCandidate));
}

function isKeywordCandidate(term: string) {
  if (WORKSPACE_CHAT_STOP_WORDS.has(term)) return false;
  if (/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term)) {
    return term.length >= 2;
  }

  return term.length >= 3;
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
