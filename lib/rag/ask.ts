import { prisma } from "@/lib/db/client";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { invokeAnswerChain, type ChatModelLike } from "@/lib/rag/answer-chain";
import { getRagModelConfig } from "@/lib/rag/config";
import { buildCurrentDocumentContext } from "@/lib/rag/document-context";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { buildDirectDocumentPrompt, type RagCitation } from "@/lib/rag/prompt";
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
  chatModelOverride?: string;
};

export type AskDocumentQuestionResult = {
  answer: string;
  citations: RagCitation[];
};

export async function askDocumentQuestion(
  input: AskDocumentQuestionInput,
): Promise<AskDocumentQuestionResult> {
  const question = input.question.trim();
  if (!question) throw new Error(ASK_ERROR_CODES.QUESTION_REQUIRED);

  const workspace = await prisma.workspace.findFirst({
    where: { slug: input.workspaceSlug },
    include: {
      members: { where: { userId: input.actorId }, take: 1 },
      documents: {
        where: { id: input.documentId, status: "ACTIVE" },
        take: 1,
      },
    },
  });

  if (!workspace || !workspace.members[0]) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }

  const role = workspace.members[0].role;
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

  const currentDocumentContext = buildCurrentDocumentContext({
    documentTitle: selectedDocument.title,
    documentPath: selectedDocument.path,
    contentMarkdown: selectedDocument.contentMarkdown,
    question,
  });
  const prompt = buildDirectDocumentPrompt({ question, currentDocumentContext });
  const citations = prompt.citations.map((citation) => ({
    ...citation,
    documentId: selectedDocument.id,
  }));
  const trace = createLangfuseCallbackConfig({
    enabled: effectiveModelConfig.langfuse.enabled,
    captureMode: effectiveModelConfig.langfuse.captureMode,
    operation: "rag.ask_document",
    chatProvider: effectiveModelConfig.chat.provider,
    chatModel: effectiveModelConfig.chat.model,
    embeddingProvider: effectiveModelConfig.embedding.provider,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    embeddingDimensions: effectiveModelConfig.embedding.dimensions,
    citationDocumentIds: citations.map((citation) => citation.documentId),
    metadata: {
      workspaceSlug: input.workspaceSlug,
      workspaceId: workspace.id,
      selectedDocumentId: selectedDocument.id,
      actorId: input.actorId,
      contextPartial: currentDocumentContext.partial,
    },
  });
  const answer = await invokeAnswerChain({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    chatModel: createChatModel(effectiveModelConfig.chat) as ChatModelLike,
    callbacks: trace.callbacks,
    metadata: trace.metadata,
  });

  return { answer, citations };
}
