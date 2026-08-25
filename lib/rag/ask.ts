import { prisma } from "@/lib/db/client";
import {
  resolveAiWorkspaceAuthorization,
  type AiAuthorizationPrincipal,
} from "@/lib/auth/trial-entitlement";
import type { Language } from "@/lib/i18n/language";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { invokeAnswerChain, type ChatModelLike } from "@/lib/rag/answer-chain";
import {
  getRagGenerationConfig,
  type RagGenerationConfig,
  type RagProvider,
} from "@/lib/rag/config";
import { buildCurrentDocumentContext } from "@/lib/rag/document-context";
import {
  INVALID_CHAT_MODEL_ERROR,
  isChatModelCompatibleWithProvider,
} from "@/lib/rag/client-model-settings";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import {
  buildDirectDocumentPrompt,
  normalizeAnswerCitations,
  type RagCitation,
} from "@/lib/rag/prompt";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { filterReadableDocuments } from "@/lib/workspace-tree";

export const ASK_ERROR_CODES = {
  QUESTION_REQUIRED: "QUESTION_REQUIRED",
} as const;

export type AskDocumentQuestionInput = {
  workspaceSlug: string;
  documentId: string;
  actorId: string;
  question: string;
  chatProviderOverride?: RagProvider;
  chatModelOverride?: string;
  uiLanguage?: Language;
};

export type AskDocumentQuestionResult = {
  answer: string;
  citations: RagCitation[];
};

export type PrepareAskDocumentQuestionInput = Omit<AskDocumentQuestionInput, "actorId"> & {
  authorizationPrincipal: AiAuthorizationPrincipal;
};

export type PreparedAskDocumentQuestion = Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  selectedDocumentId: string;
  question: string;
  prompt: ReturnType<typeof buildDirectDocumentPrompt>;
  citations: RagCitation[];
  effectiveModelConfig: RagGenerationConfig;
  contextPartial: boolean;
  privacyMode: "authenticated-user" | "anonymous-trial";
  actorId?: string;
}>;

export async function askDocumentQuestion(
  input: AskDocumentQuestionInput,
): Promise<AskDocumentQuestionResult> {
  const prepared = await prepareAskDocumentQuestion({
    ...input,
    authorizationPrincipal: { kind: "user", userId: input.actorId },
  });
  return answerPreparedAskDocumentQuestion(prepared);
}

/** Resolves authorization and provider-ready prompt data without calling a model. */
export async function prepareAskDocumentQuestion(
  input: PrepareAskDocumentQuestionInput,
): Promise<PreparedAskDocumentQuestion> {
  const question = input.question.trim();
  if (!question) throw new Error(ASK_ERROR_CODES.QUESTION_REQUIRED);

  const workspace = await prisma.workspace.findFirst({
    where: {
      slug: input.workspaceSlug,
      archivedAt: null,
      ...(input.authorizationPrincipal.kind === "user"
        ? { members: { some: { userId: input.authorizationPrincipal.userId } } }
        : { id: input.authorizationPrincipal.workspaceId }),
    },
    include: {
      documents: {
        where: { id: input.documentId, status: "ACTIVE" },
        take: 1,
      },
    },
  });

  if (!workspace) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  const authorization = resolveAiWorkspaceAuthorization(input.authorizationPrincipal, workspace);
  if (!authorization) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  const membership = authorization.kind === "user"
    ? await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, userId: authorization.userId },
      select: { role: true },
    })
    : null;
  if (authorization.kind === "user" && !membership) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }

  const role = authorization.kind === "user" ? membership!.role : authorization.role;
  const documentIds = workspace.documents.map((document) => document.id);
  const [documentsWithExplicitPermissions, userDocumentPermissions] = await Promise.all([
    documentIds.length > 0
      ? prisma.permission.findMany({
        where: { resourceType: "DOCUMENT", resourceId: { in: documentIds } },
        distinct: ["resourceId"],
        select: { resourceId: true },
      })
      : Promise.resolve([]),
    documentIds.length > 0 && authorization.kind === "user"
      ? prisma.permission.findMany({
        where: {
          resourceType: "DOCUMENT",
          resourceId: { in: documentIds },
          subjectType: "USER",
          subjectId: authorization.userId,
        },
        select: { resourceId: true, permission: true },
      })
      : Promise.resolve([]),
  ]);

  const explicitDocumentIds = new Set(
    documentsWithExplicitPermissions.map((permission) => permission.resourceId),
  );
  const permissionsByDocumentId = new Map<string, typeof userDocumentPermissions>();
  for (const permission of userDocumentPermissions) {
    const permissions = permissionsByDocumentId.get(permission.resourceId) ?? [];
    permissions.push(permission);
    permissionsByDocumentId.set(permission.resourceId, permissions);
  }
  const userPermissionByDocumentId = new Map(
    documentIds.map((documentId) => [
      documentId,
      highestPermissionLevel(
        (permissionsByDocumentId.get(documentId) ?? []).map((permission) => permission.permission),
      ),
    ]),
  );
  const readableDocuments = filterReadableDocuments({
    documents: workspace.documents,
    role,
    explicitDocumentIds,
    userPermissionsByDocumentId: userPermissionByDocumentId,
  });
  const selectedDocument = readableDocuments.find((document) => document.id === input.documentId);

  if (!selectedDocument) {
    throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  }
  if (input.chatProviderOverride && !input.chatModelOverride) {
    throw new Error(INVALID_CHAT_MODEL_ERROR);
  }
  const defaultModelConfig = input.chatProviderOverride ? null : getRagGenerationConfig();
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
  let effectiveModelConfig: RagGenerationConfig;
  if (input.chatProviderOverride || input.chatModelOverride) {
    effectiveModelConfig = getRagGenerationConfig(process.env, {
      provider: input.chatProviderOverride,
      model: input.chatModelOverride,
    });
  } else {
    effectiveModelConfig = defaultModelConfig ?? getRagGenerationConfig();
  }

  const currentDocumentContext = buildCurrentDocumentContext({
    documentTitle: selectedDocument.title,
    documentPath: selectedDocument.path,
    contentMarkdown: selectedDocument.contentMarkdown,
    question,
  });
  const prompt = buildDirectDocumentPrompt({
    question,
    currentDocumentContext,
    uiLanguage: input.uiLanguage,
  });
  const citations = prompt.citations.map((citation) => ({
    ...citation,
    documentId: selectedDocument.id,
  }));
  return {
    workspaceId: workspace.id,
    workspaceSlug: input.workspaceSlug,
    selectedDocumentId: selectedDocument.id,
    question,
    prompt,
    citations,
    effectiveModelConfig,
    contextPartial: currentDocumentContext.partial,
    privacyMode: authorization.kind === "user" ? "authenticated-user" : "anonymous-trial",
    ...(authorization.kind === "user" ? { actorId: authorization.userId } : {}),
  };
}

export async function answerPreparedAskDocumentQuestion(
  prepared: PreparedAskDocumentQuestion,
): Promise<AskDocumentQuestionResult> {
  const trace = createLangfuseCallbackConfig({
    enabled: prepared.effectiveModelConfig.langfuse.enabled,
    captureMode: prepared.privacyMode === "anonymous-trial"
      ? "metadata"
      : prepared.effectiveModelConfig.langfuse.captureMode,
    operation: "rag.ask_document",
    chatProvider: prepared.effectiveModelConfig.chat.provider,
    chatModel: prepared.effectiveModelConfig.chat.model,
    citationDocumentIds: prepared.citations.map((citation) => citation.documentId),
    metadata: {
      workspaceSlug: prepared.workspaceSlug,
      workspaceId: prepared.workspaceId,
      selectedDocumentId: prepared.selectedDocumentId,
      ...(prepared.actorId ? { actorId: prepared.actorId } : {}),
      contextPartial: prepared.contextPartial,
    },
  });
  const answer = await invokeAnswerChain({
    systemPrompt: prepared.prompt.system,
    userPrompt: prepared.prompt.user,
    chatModel: createChatModel(prepared.effectiveModelConfig.chat) as ChatModelLike,
    callbacks: trace.callbacks,
    metadata: trace.metadata,
  });

  return normalizeAnswerCitations(answer, prepared.citations);
}
