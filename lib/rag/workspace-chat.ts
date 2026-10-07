import { startAiObservation, observeAiStage, type AiObservation } from "@/lib/rag/ai-observation";
import { Prisma } from "@prisma/client";
import type { AiAuthorizationPrincipal } from "@/lib/auth/trial-entitlement";
import { prisma } from "@/lib/db/client";
import type { Language } from "@/lib/i18n/language";
import {
  INVALID_CHAT_MODEL_ERROR,
  isChatModelCompatibleWithProvider,
} from "@/lib/rag/client-model-settings";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { invokeAnswerChain, streamAnswerChain, type ChatModelLike } from "@/lib/rag/answer-chain";
import { getRagModelConfig, type RagModelConfig, type RagProvider } from "@/lib/rag/config";
import { assertCurrentEmbeddingIndex, embedText } from "@/lib/rag/embedding-client";
import { safeIndexSavedDocument } from "@/lib/rag/index-document";
import {
  createLangfuseCallbackConfig,
  type LangfuseCallbackConfig,
} from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { buildRagPrompt, normalizeAnswerCitations, type RagPrompt } from "@/lib/rag/prompt";
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
  chatProviderOverride?: RagProvider;
  chatModelOverride?: string;
  uiLanguage?: Language;
  signal?: AbortSignal;
};

type WorkspaceChatPreparedMessageCommon = {
  observation?: AiObservation;
  message: string;
  prompt: RagPrompt;
  promptChunkCount: number;
  citationChunkIds: string[];
  trace: LangfuseCallbackConfig;
  chatModel: ChatModelLike;
  chatProviderName: string;
  chatModelName: string;
};

export type PersistentWorkspaceChatPreparedMessage =
  WorkspaceChatPreparedMessageCommon & {
    kind: "persistent";
    threadId: string;
  };

export type StatelessTrialWorkspaceChatPreparedMessage =
  WorkspaceChatPreparedMessageCommon & {
    kind: "stateless-trial";
  };

export type WorkspaceChatPreparedMessage =
  | PersistentWorkspaceChatPreparedMessage
  | StatelessTrialWorkspaceChatPreparedMessage;

type WorkspaceChatReadableDocument = {
  id: string;
  title: string;
  path: string;
  contentMarkdown: string;
  contentText: string;
  updatedAt: Date;
};

export type WorkspaceChatMessagePreflight =
  | Readonly<{
      kind: "persistent";
      workspaceId: string;
      workspaceSlug: string;
      actorId: string;
      readableDocuments: WorkspaceChatReadableDocument[];
    }>
  | Readonly<{
      kind: "stateless-trial";
      workspaceId: string;
      workspaceSlug: string;
      readableDocuments: WorkspaceChatReadableDocument[];
    }>;

export type PreflightedWorkspaceChatMessageInput = {
  preflight: WorkspaceChatMessagePreflight;
  message: string;
  selectedDocumentId?: string | null;
  chatProviderOverride?: RagProvider;
  chatModelOverride?: string;
  uiLanguage?: Language;
  signal?: AbortSignal;
};

export type WorkspaceChatStreamCallbacks = {
  /** Routes finalize the request after validating the last lease heartbeat. */
  deferObservationEnd?: boolean;
  onToken: (token: string) => Promise<void> | void;
  signal?: AbortSignal;
};

const RECENT_MESSAGE_LIMIT = 12;
const THREAD_MESSAGE_LIMIT = 50;
const RETRIEVAL_LIMIT = 60;
const PROMPT_CHUNK_LIMIT = 12;
const MAX_CHUNKS_PER_DOCUMENT = 3;
const INDEX_BACKFILL_DOCUMENT_LIMIT = 8;
const SELECTED_DOCUMENT_PRIORITY_DISTANCE_MARGIN = 0.15;
const CONVERSATION_QUERY_MAX_CHARS = 6_000;
const CONVERSATION_MEMORY_SUMMARY_MAX_CHARS = 2_000;
const CONVERSATION_MEMORY_SOURCE_CHUNK_CHARS = 4_000;
const TRUNCATION_MARKER = "\n[truncated]";
const CONVERSATION_MEMORY_SUMMARY_SYSTEM_PROMPT = [
  "You are Munjib's workspace conversation memory summarizer.",
  "Maintain a concise memory of durable user intent, decisions, constraints, entities, and unresolved questions.",
  "Merge the existing memory with the new conversation excerpt.",
  "Prefer facts and user preferences over wording.",
  "Do not include citations, markdown tables, or implementation commentary.",
  "Keep the memory under 1,500 characters.",
].join(" ");
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
  const prepared = await prepareWorkspaceChatMessageStream(input);
  const observation = prepared.observation;
  const work = async () => {
    const answer = await invokeAnswerChain({
      systemPrompt: prepared.prompt.system,
      userPrompt: prepared.prompt.user,
      chatModel: prepared.chatModel,
      callbacks: prepared.trace.callbacks,
      metadata: prepared.trace.metadata,
    });

    return persistWorkspaceChatAnswer(prepared, answer);
  };
  try { return await (observation ? observation.run(work) : work()); }
  catch (error) { observation?.end(error); throw error; }
  finally { observation?.end(); }
}

/** Performs workspace/document authorization without chat, indexing, embedding, or model side effects. */
export async function preflightWorkspaceChatMessageStream(input: {
  workspaceSlug: string;
  authorizationPrincipal: AiAuthorizationPrincipal;
}): Promise<WorkspaceChatMessagePreflight> {
  if (input.authorizationPrincipal.kind === "user") {
    const workspace = await loadWorkspaceForChat({
      workspaceSlug: input.workspaceSlug,
      actorId: input.authorizationPrincipal.userId,
    });
    return {
      kind: "persistent",
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      actorId: input.authorizationPrincipal.userId,
      readableDocuments: workspace.readableDocuments,
    };
  }

  const principal = input.authorizationPrincipal;
  if (input.workspaceSlug !== principal.workspaceSlug) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  const workspace = await prisma.workspace.findFirst({
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
  if (!workspace) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  const documentIds = workspace.documents.map((document) => document.id);
  const documentsWithExplicitPermissions =
    documentIds.length > 0
      ? await prisma.permission.findMany({
          where: { resourceType: "DOCUMENT", resourceId: { in: documentIds } },
          distinct: ["resourceId"],
          select: { resourceId: true },
        })
      : [];
  const explicitlyRestrictedDocumentIds = new Set(
    documentsWithExplicitPermissions.map((permission) => permission.resourceId),
  );

  return {
    kind: "stateless-trial",
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    readableDocuments: workspace.documents.filter(
      (document) => !explicitlyRestrictedDocumentIds.has(document.id),
    ),
  };
}

export async function prepareWorkspaceChatMessageStream(
  input: SendWorkspaceChatMessageInput,
): Promise<PersistentWorkspaceChatPreparedMessage> {
  throwIfWorkspaceChatStreamAborted(input.signal);
  const message = input.message.trim();
  if (!message) throw new Error(WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED);

  const preflight = await preflightWorkspaceChatMessageStream({
    workspaceSlug: input.workspaceSlug,
    authorizationPrincipal: { kind: "user", userId: input.actorId },
  });
  const prepared = await preparePreflightedWorkspaceChatMessageStream({
    preflight,
    message,
    ...(input.uiLanguage ? { uiLanguage: input.uiLanguage } : {}),
    ...(input.selectedDocumentId !== undefined
      ? { selectedDocumentId: input.selectedDocumentId }
      : {}),
    ...(input.chatProviderOverride
      ? { chatProviderOverride: input.chatProviderOverride }
      : {}),
    ...(input.chatModelOverride ? { chatModelOverride: input.chatModelOverride } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (prepared.kind !== "persistent") {
    throw new Error("WORKSPACE_CHAT_THREAD_REQUIRED");
  }
  return prepared;
}

export async function preparePreflightedWorkspaceChatMessageStream(
  input: PreflightedWorkspaceChatMessageInput,
): Promise<WorkspaceChatPreparedMessage> {
  const observation = startAiObservation("workspace_chat", input.preflight.kind === "stateless-trial");
  try {
    const prepared = await observation.run(() => observeAiStage("preparation", () => preparePreflightedWorkspaceChatMessageStreamInternal(input)));
    return { ...prepared, observation };
  } catch (error) { observation.end(error); throw error; }
}

async function preparePreflightedWorkspaceChatMessageStreamInternal(
  input: PreflightedWorkspaceChatMessageInput,
): Promise<WorkspaceChatPreparedMessage> {
  throwIfWorkspaceChatStreamAborted(input.signal);
  const message = input.message.trim();
  if (!message) throw new Error(WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED);

  const workspace = input.preflight;
  let thread: Awaited<ReturnType<typeof getOrCreateActiveThread>> | undefined;
  let conversationQuestion = message;
  if (workspace.kind === "persistent") {
    thread = await getOrCreateActiveThread({
      workspaceId: workspace.workspaceId,
      actorId: workspace.actorId,
    });
    throwIfWorkspaceChatStreamAborted(input.signal);
  }

  const effectiveModelConfig = resolveWorkspaceChatModelConfig(input);
  assertCurrentEmbeddingIndex(effectiveModelConfig);

  if (thread) {
    const orderedThreadMessages = orderedMessagesForDisplay(thread.messages);
    const conversationContext = await buildWorkspaceConversationContext({
      thread,
      messages: orderedThreadMessages,
      currentMessage: message,
      modelConfig: effectiveModelConfig,
    });
    throwIfWorkspaceChatStreamAborted(input.signal);
    conversationQuestion = conversationContext.question;
  }
  const readableDocumentIds = workspace.readableDocuments.map((document) => document.id);
  const selectedDocumentId = readableDocumentIds.includes(input.selectedDocumentId ?? "")
    ? (input.selectedDocumentId ?? undefined)
    : undefined;
  await observeAiStage("indexing", () => ensureWorkspaceChatRetrievalIndex({
    workspaceId: workspace.workspaceId,
    readableDocuments: workspace.readableDocuments,
    query: conversationQuestion,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    selectedDocumentId,
    privacySafeLogging: workspace.kind === "stateless-trial",
    signal: input.signal,
  }));
  throwIfWorkspaceChatStreamAborted(input.signal);
  const embedding = await embedText(conversationQuestion, {
    config: effectiveModelConfig,
    privacySafeLogging: workspace.kind === "stateless-trial",
    signal: input.signal,
  });
  throwIfWorkspaceChatStreamAborted(input.signal);
  const globalChunks = await searchSimilarChunks({
    workspaceId: workspace.workspaceId,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    embedding,
    readableDocumentIds,
    limit: RETRIEVAL_LIMIT,
  });
  throwIfWorkspaceChatStreamAborted(input.signal);
  const selectedDocumentChunks = selectedDocumentId
    ? await searchSimilarChunks({
        workspaceId: workspace.workspaceId,
        embeddingModel: effectiveModelConfig.embedding.indexId,
        embedding,
        readableDocumentIds: [selectedDocumentId],
        limit: PROMPT_CHUNK_LIMIT,
      })
    : [];
  throwIfWorkspaceChatStreamAborted(input.signal);
  const chunks = mergeRetrievedChunks(globalChunks, selectedDocumentChunks);
  const promptChunks = capPromptChunks(prioritizeSelectedDocumentChunks(chunks, selectedDocumentId));
  const prompt = buildRagPrompt({
    question: conversationQuestion,
    chunks: promptChunks,
    uiLanguage: input.uiLanguage,
  });
  const citationChunkIds = promptChunks.map((chunk) => chunk.id);
  const trace = createLangfuseCallbackConfig({
    enabled: effectiveModelConfig.langfuse.enabled,
    captureMode:
      workspace.kind === "stateless-trial"
        ? "metadata"
        : effectiveModelConfig.langfuse.captureMode,
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
      workspaceSlug: workspace.workspaceSlug,
      workspaceId: workspace.workspaceId,
      ...(thread && workspace.kind === "persistent"
        ? { threadId: thread.id, actorId: workspace.actorId }
        : { anonymousTrial: true }),
      ...(selectedDocumentId ? { selectedDocumentId } : {}),
    },
  });

  const preparedCommon: WorkspaceChatPreparedMessageCommon = {
    message,
    prompt,
    promptChunkCount: promptChunks.length,
    citationChunkIds,
    trace,
    chatModel: createChatModel(effectiveModelConfig.chat) as ChatModelLike,
    chatProviderName: effectiveModelConfig.chat.provider,
    chatModelName: effectiveModelConfig.chat.model,
  };
  if (workspace.kind === "persistent" && thread) {
    return { ...preparedCommon, kind: "persistent", threadId: thread.id };
  }
  return { ...preparedCommon, kind: "stateless-trial" };
}

export function sendPreparedWorkspaceChatMessageStream(
  prepared: PersistentWorkspaceChatPreparedMessage,
  callbacks: WorkspaceChatStreamCallbacks,
): ReturnType<typeof persistWorkspaceChatAnswer>;
export function sendPreparedWorkspaceChatMessageStream(
  prepared: StatelessTrialWorkspaceChatPreparedMessage,
  callbacks: WorkspaceChatStreamCallbacks,
): Promise<ReturnType<typeof transientWorkspaceChatAnswer>>;
export function sendPreparedWorkspaceChatMessageStream(
  prepared: WorkspaceChatPreparedMessage,
  callbacks: WorkspaceChatStreamCallbacks,
): Promise<
  | Awaited<ReturnType<typeof persistWorkspaceChatAnswer>>
  | ReturnType<typeof transientWorkspaceChatAnswer>
>;
export async function sendPreparedWorkspaceChatMessageStream(
  prepared: WorkspaceChatPreparedMessage,
  callbacks: WorkspaceChatStreamCallbacks,
) {
  const observation = prepared.observation ?? startAiObservation("workspace_chat", prepared.kind === "stateless-trial");
  try { return await observation.run(() => sendPreparedWorkspaceChatMessageStreamInternal(prepared, callbacks)); }
  catch (error) { observation.end(error); throw error; }
  finally { if (!callbacks.deferObservationEnd) observation.end(); }
}

async function sendPreparedWorkspaceChatMessageStreamInternal(
  prepared: WorkspaceChatPreparedMessage,
  callbacks: WorkspaceChatStreamCallbacks,
) {
  throwIfWorkspaceChatStreamAborted(callbacks.signal);
  const answer = await streamAnswerChain({
    systemPrompt: prepared.prompt.system,
    userPrompt: prepared.prompt.user,
    chatModel: prepared.chatModel,
    config: callbacks.signal ? { signal: callbacks.signal } : undefined,
    callbacks: prepared.trace.callbacks,
    metadata: prepared.trace.metadata,
    privacySafeLogging: prepared.kind === "stateless-trial",
    onToken: callbacks.onToken,
  });
  throwIfWorkspaceChatStreamAborted(callbacks.signal);

  if (prepared.kind === "stateless-trial") {
    return transientWorkspaceChatAnswer(prepared, answer);
  }
  return persistWorkspaceChatAnswer(prepared, answer);
}

function throwIfWorkspaceChatStreamAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new Error("WORKSPACE_CHAT_STREAM_ABORTED");
  }
}

function resolveWorkspaceChatModelConfig(
  input: Pick<SendWorkspaceChatMessageInput, "chatProviderOverride" | "chatModelOverride">,
) {
  if (input.chatProviderOverride && !input.chatModelOverride) {
    throw new Error(INVALID_CHAT_MODEL_ERROR);
  }
  const defaultModelConfig = input.chatProviderOverride ? null : getRagModelConfig();
  const chatProvider = input.chatProviderOverride ?? defaultModelConfig?.chat.provider;
  if (!chatProvider) {
    throw new Error(INVALID_CHAT_MODEL_ERROR);
  }
  if (
    input.chatModelOverride &&
    !isChatModelCompatibleWithProvider({
      chatProvider,
      chatModel: input.chatModelOverride,
    })
  ) {
    throw new Error(INVALID_CHAT_MODEL_ERROR);
  }
  if (input.chatProviderOverride || input.chatModelOverride) {
    return getRagModelConfig(process.env, {
      provider: input.chatProviderOverride,
      model: input.chatModelOverride,
    });
  }

  return defaultModelConfig ?? getRagModelConfig();
}

async function persistWorkspaceChatAnswer(
  prepared: PersistentWorkspaceChatPreparedMessage,
  answer: string,
) {
  const normalizedAnswer = normalizeAnswerCitations(answer, prepared.prompt.citations);
  const answerCitations = normalizedAnswer.citations;
  const contextMeta = {
    retrievedChunkCount: prepared.promptChunkCount,
    citationChunkIds: prepared.citationChunkIds,
  };
  const { userMessage, assistantMessage, updatedThread } = await prisma.$transaction(async (tx) => {
    const activeThread = await tx.aiChatThread.updateMany({
      where: { id: prepared.threadId, status: "ACTIVE" },
      data: { lastMessageAt: new Date() },
    });
    if (activeThread.count === 0) {
      throw new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED);
    }

    const persistedUserMessage = await tx.aiChatMessage.create({
      data: {
        threadId: prepared.threadId,
        role: "USER",
        content: prepared.message,
      },
    });
    const persistedAssistantMessage = await tx.aiChatMessage.create({
      data: {
        threadId: prepared.threadId,
        role: "ASSISTANT",
        content: normalizedAnswer.answer,
        citations: answerCitations as Prisma.InputJsonValue,
        contextMeta,
        model: prepared.chatModelName,
      },
    });
    const persistedThread = await tx.aiChatThread.update({
      where: { id: prepared.threadId },
      data: { lastMessageAt: persistedAssistantMessage.createdAt },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: THREAD_MESSAGE_LIMIT,
        },
      },
    });

    return {
      userMessage: persistedUserMessage,
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

function transientWorkspaceChatAnswer(
  prepared: StatelessTrialWorkspaceChatPreparedMessage,
  answer: string,
) {
  const normalizedAnswer = normalizeAnswerCitations(answer, prepared.prompt.citations);
  return {
    assistantMessage: {
      role: "ASSISTANT" as const,
      content: normalizedAnswer.answer,
      citations: normalizedAnswer.citations,
    },
    citations: normalizedAnswer.citations,
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
    where: {
      slug: input.workspaceSlug,
      archivedAt: null,
      members: {
        some: { userId: input.actorId },
      },
    },
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
  selectedDocumentId: string | undefined;
  privacySafeLogging: boolean;
  signal?: AbortSignal;
}) {
  const candidates = selectIndexBackfillDocuments({
    documents: input.readableDocuments,
    query: input.query,
    selectedDocumentId: input.selectedDocumentId,
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
      privacySafeLogging: input.privacySafeLogging,
      signal: input.signal,
    });
    throwIfWorkspaceChatStreamAborted(input.signal);
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
  selectedDocumentId?: string;
}) {
  const queryTerms = normalizedKeywordTerms(input.query);
  const shouldIncludeSelectedDocument = Boolean(
    input.selectedDocumentId && isDocumentReferentialQuery(input.query),
  );
  if (queryTerms.size === 0 && !shouldIncludeSelectedDocument) return [];

  const candidates = input.documents
    .map((document, order) => ({
      document,
      order,
      score: Math.max(
        scoreDocumentForBackfill(document, queryTerms),
        shouldIncludeSelectedDocument && document.id === input.selectedDocumentId ? 1 : 0,
      ),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.order - right.order;
    });
  if (!shouldIncludeSelectedDocument || !input.selectedDocumentId) {
    return candidates
      .slice(0, INDEX_BACKFILL_DOCUMENT_LIMIT)
      .map((candidate) => candidate.document);
  }

  const selectedCandidate = candidates.find(
    (candidate) => candidate.document.id === input.selectedDocumentId,
  );
  if (!selectedCandidate) {
    return candidates
      .slice(0, INDEX_BACKFILL_DOCUMENT_LIMIT)
      .map((candidate) => candidate.document);
  }

  const remainingCandidates = candidates.filter(
    (candidate) => candidate.document.id !== input.selectedDocumentId,
  );
  return [selectedCandidate, ...remainingCandidates.slice(0, INDEX_BACKFILL_DOCUMENT_LIMIT - 1)].map(
    (candidate) => candidate.document,
  );
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

function mergeRetrievedChunks(primaryChunks: RetrievedChunk[], additionalChunks: RetrievedChunk[]) {
  const merged: RetrievedChunk[] = [];
  const seenChunkIds = new Set<string>();

  for (const chunk of [...primaryChunks, ...additionalChunks]) {
    if (seenChunkIds.has(chunk.id)) continue;

    seenChunkIds.add(chunk.id);
    merged.push(chunk);
  }

  return merged;
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

function isDocumentReferentialQuery(query: string) {
  const normalized = query.normalize("NFKC").toLowerCase();
  return (
    /\b(this|current|open|selected)\s+(document|doc|page|note)\b/.test(normalized) ||
    /\b(summarize|summary|explain|describe)\s+(this|current|open|selected)\b/.test(
      normalized,
    ) ||
    normalized.includes("이 문서") ||
    normalized.includes("현재 문서") ||
    normalized.includes("열린 문서") ||
    normalized.includes("이 페이지") ||
    normalized.includes("현재 페이지") ||
    normalized.includes("문서 요약") ||
    normalized.includes("페이지 요약")
  );
}

function withDisplayOrderedMessages<
  TThread extends { messages: Array<{ createdAt: Date; id?: string; role?: string }> },
>(thread: TThread) {
  return {
    ...thread,
    messages: orderedMessagesForDisplay(thread.messages),
  };
}

function orderedMessagesForDisplay<
  TMessage extends { createdAt: Date; id?: string; role?: string },
>(
  messages: TMessage[],
) {
  return [...messages].sort((left, right) => {
    const createdAtDiff = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;

    const roleDiff = messageRoleOrder(left) - messageRoleOrder(right);
    if (roleDiff !== 0) return roleDiff;

    return (left.id ?? "").localeCompare(right.id ?? "");
  });
}

async function buildWorkspaceConversationContext(input: {
  thread: { id: string; memorySummary?: string | null; memoryUpdatedAt?: Date | null };
  messages: Array<{ role: string; content: string; createdAt: Date }>;
  currentMessage: string;
  modelConfig: RagModelConfig;
}) {
  const existingMemorySummary = normalizeMemorySummary(input.thread.memorySummary);
  const summarizableMessages = messagesForMemoryRefresh({
    messages: input.messages,
    memoryUpdatedAt: input.thread.memoryUpdatedAt,
  });
  const needsMemoryRefresh = conversationQuestionWouldExceedBudget({
    memorySummary: existingMemorySummary,
    messages: summarizableMessages,
    currentMessage: input.currentMessage,
  });
  const initialQuestion = buildConversationQuestion({
    memorySummary: existingMemorySummary,
    messages: input.messages,
    currentMessage: input.currentMessage,
  });
  if (!needsMemoryRefresh) {
    return { question: initialQuestion, memorySummary: existingMemorySummary };
  }

  try {
    const memorySummary = await summarizeConversationMemory({
      existingMemorySummary,
      messages: summarizableMessages,
      modelConfig: input.modelConfig,
    });

    if (memorySummary) {
      await prisma.aiChatThread.update({
        where: { id: input.thread.id },
        data: {
          memorySummary,
          memoryUpdatedAt: new Date(),
        },
      });

      return {
        question: buildConversationQuestion({
          memorySummary,
          messages: input.messages,
          currentMessage: input.currentMessage,
        }),
        memorySummary,
      };
    }
  } catch (error) {
    console.error("Workspace chat memory summarization failed:", error);
  }

  return {
    question: buildConversationQuestion({
      memorySummary: existingMemorySummary,
      messages: input.messages,
      currentMessage: input.currentMessage,
    }),
    memorySummary: existingMemorySummary,
  };
}

function conversationQuestionWouldExceedBudget(input: {
  memorySummary: string | null;
  messages: Array<{ role: string; content: string }>;
  currentMessage: string;
}) {
  const recentMessages = input.messages.slice(-RECENT_MESSAGE_LIMIT);
  const parts = [
    input.memorySummary ? `Conversation memory summary:\n${input.memorySummary.trim()}` : "",
    recentMessages.length > 0
      ? [
          "Recent conversation:",
          ...recentMessages.map(
            (message) => `${message.role}: ${stripCitationMarkers(message.content)}`,
          ),
        ].join("\n")
      : "",
    buildCurrentUserMessageLine(input.currentMessage),
  ].filter(Boolean);

  return parts.join("\n\n").length > CONVERSATION_QUERY_MAX_CHARS;
}

function messagesForMemoryRefresh(input: {
  messages: Array<{ role: string; content: string; createdAt: Date }>;
  memoryUpdatedAt?: Date | null;
}) {
  const messagesAfterMemory = input.memoryUpdatedAt
    ? input.messages.filter((message) => message.createdAt > input.memoryUpdatedAt!)
    : input.messages;

  return messagesAfterMemory.slice(-RECENT_MESSAGE_LIMIT);
}

async function summarizeConversationMemory(input: {
  existingMemorySummary: string | null;
  messages: Array<{ role: string; content: string }>;
  modelConfig: RagModelConfig;
}) {
  const source = formatConversationMessagesForMemory(input.messages);
  if (!source.trim()) return input.existingMemorySummary;

  let memorySummary = input.existingMemorySummary ?? "";
  const chatModel = createChatModel(input.modelConfig.chat) as ChatModelLike;

  for (const chunk of chunkText(source, CONVERSATION_MEMORY_SOURCE_CHUNK_CHARS)) {
    const summary = await invokeAnswerChain({
      metadata: { chatModel: input.modelConfig.chat.model, chatProvider: input.modelConfig.chat.provider },
      systemPrompt: CONVERSATION_MEMORY_SUMMARY_SYSTEM_PROMPT,
      userPrompt: buildConversationMemorySummaryPrompt({
        existingMemorySummary: memorySummary,
        conversationExcerpt: chunk,
      }),
      chatModel,
    });
    memorySummary = normalizeMemorySummary(summary) ?? memorySummary;
  }

  return normalizeMemorySummary(memorySummary);
}

function buildConversationMemorySummaryPrompt(input: {
  existingMemorySummary: string;
  conversationExcerpt: string;
}) {
  return [
    "Existing memory summary:",
    input.existingMemorySummary.trim() || "No existing memory summary.",
    "",
    "New conversation excerpt:",
    input.conversationExcerpt.trim(),
    "",
    "Return the updated memory summary only.",
  ].join("\n");
}

function formatConversationMessagesForMemory(
  messages: Array<{ role: string; content: string }>,
) {
  return messages
    .map((message) => `${message.role}: ${stripCitationMarkers(message.content)}`)
    .join("\n");
}

function buildConversationQuestion(input: {
  memorySummary: string | null;
  messages: Array<{ role: string; content: string }>;
  currentMessage: string;
}) {
  const recentMessages = input.messages.slice(-RECENT_MESSAGE_LIMIT);
  const prefixParts = input.memorySummary
    ? ["Conversation memory summary:", input.memorySummary.trim(), ""]
    : [];
  const fixedPrefix = prefixParts.length > 0 ? `${prefixParts.join("\n")}\n` : "";
  const currentLine = buildCurrentUserMessageLine(
    input.currentMessage,
    Math.max(0, CONVERSATION_QUERY_MAX_CHARS - fixedPrefix.length - 2),
  );
  const recentHeader = recentMessages.length > 0 ? "Recent conversation:" : "";
  const historyBudget =
    CONVERSATION_QUERY_MAX_CHARS -
    fixedPrefix.length -
    recentHeader.length -
    currentLine.length -
    3;
  if (historyBudget <= 0) {
    return [fixedPrefix.trim(), currentLine].filter(Boolean).join("\n\n");
  }

  const selectedHistoryLines: string[] = [];
  let usedHistoryChars = 0;
  for (const message of [...recentMessages].reverse()) {
    const line = `${message.role}: ${stripCitationMarkers(message.content)}`;
    const separatorLength = selectedHistoryLines.length === 0 ? 0 : 1;
    if (usedHistoryChars + separatorLength + line.length <= historyBudget) {
      selectedHistoryLines.push(line);
      usedHistoryChars += separatorLength + line.length;
      continue;
    }

    continue;
  }

  const parts = [...prefixParts];
  if (selectedHistoryLines.length > 0) {
    parts.push("Recent conversation:", ...selectedHistoryLines.reverse(), "");
  }
  parts.push(currentLine);
  return parts.join("\n");
}

function buildCurrentUserMessageLine(
  currentMessage: string,
  maxChars = CONVERSATION_QUERY_MAX_CHARS,
) {
  const prefix = "Current user message: ";
  if (maxChars <= prefix.length) return truncateText(prefix.trim(), maxChars);

  return `${prefix}${truncateText(currentMessage, maxChars - prefix.length)}`;
}

function messageRoleOrder(message: { role?: string }) {
  if (message.role === "USER") return 0;
  if (message.role === "ASSISTANT") return 1;
  return 2;
}

function stripCitationMarkers(content: string) {
  return content
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  if (maxChars <= TRUNCATION_MARKER.length) return text.slice(0, maxChars);

  return `${text.slice(0, maxChars - TRUNCATION_MARKER.length).trimEnd()}${TRUNCATION_MARKER}`;
}

function normalizeMemorySummary(summary: string | null | undefined) {
  const normalized = summary?.trim();
  if (!normalized) return null;

  return truncateText(normalized, CONVERSATION_MEMORY_SUMMARY_MAX_CHARS);
}

function chunkText(text: string, maxChars: number) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    const breakAt = findChunkBreak(remaining, maxChars);
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function findChunkBreak(text: string, maxChars: number) {
  const newlineBreak = text.lastIndexOf("\n", maxChars);
  if (newlineBreak > Math.floor(maxChars * 0.6)) return newlineBreak;

  const spaceBreak = text.lastIndexOf(" ", maxChars);
  if (spaceBreak > Math.floor(maxChars * 0.6)) return spaceBreak;

  return maxChars;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
