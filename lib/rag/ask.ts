import { prisma } from "@/lib/db/client";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { invokeAnswerChain, type ChatModelLike } from "@/lib/rag/answer-chain";
import { getRagModelConfig } from "@/lib/rag/config";
import { assertCurrentEmbeddingIndex, embedText } from "@/lib/rag/embedding-client";
import { safeIndexSavedDocument } from "@/lib/rag/index-document";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { buildRagPrompt, type RagCitation } from "@/lib/rag/prompt";
import { buildRetrievalScopes, rerankRetrievedChunks } from "@/lib/rag/retriever";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
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
        where: { status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
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
  assertCurrentEmbeddingIndex(modelConfig);

  const persistedLinks = await prisma.documentLink.findMany({
    where: { workspaceId: workspace.id },
    select: {
      sourceDocumentId: true,
      targetDocumentId: true,
      targetTitleRaw: true,
      isBroken: true,
      isAmbiguous: true,
    },
  });

  await safeIndexSavedDocument({
    documentId: selectedDocument.id,
    embeddingModel: modelConfig.embedding.indexId,
  });

  const scopes = buildRetrievalScopes({
    selectedDocumentId: selectedDocument.id,
    readableDocuments: readableDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      path: document.path,
      contentMarkdown: document.contentMarkdown,
    })),
    persistedLinks,
  });
  const scopedDocumentIds = uniqueDocumentIds([
    ...scopes.currentDocumentIds,
    ...scopes.linkedDocumentIds,
    ...scopes.backlinkDocumentIds,
    ...scopes.sameTagDocumentIds,
    ...scopes.fallbackDocumentIds,
  ]);
  const embedding = await embedText(question, { config: modelConfig });
  const chunks = await searchSimilarChunks({
    workspaceId: workspace.id,
    embeddingModel: modelConfig.embedding.indexId,
    embedding,
    readableDocumentIds: scopedDocumentIds,
    limit: 60,
  });
  const rankedChunks = rerankRetrievedChunks({
    chunks,
    scopes,
    query: question,
    limit: 20,
  });
  const prompt = buildRagPrompt({ question, chunks: rankedChunks });
  const trace = createLangfuseCallbackConfig({
    enabled: modelConfig.langfuse.enabled,
    operation: "rag.answer",
    chatProvider: modelConfig.chat.provider,
    chatModel: modelConfig.chat.model,
    embeddingProvider: modelConfig.embedding.provider,
    embeddingModel: modelConfig.embedding.indexId,
    embeddingDimensions: modelConfig.embedding.dimensions,
    retrievedChunkCount: rankedChunks.length,
    citationDocumentIds: prompt.citations.map((citation) => citation.documentId),
    citationChunkIds: rankedChunks.map((chunk) => chunk.id),
    metadata: {
      workspaceSlug: input.workspaceSlug,
      workspaceId: workspace.id,
      selectedDocumentId: selectedDocument.id,
      actorId: input.actorId,
    },
  });
  const answer = await invokeAnswerChain({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    chatModel: createChatModel(modelConfig.chat) as ChatModelLike,
    callbacks: trace.callbacks,
    metadata: trace.metadata,
  });

  return { answer, citations: prompt.citations };
}

function uniqueDocumentIds(documentIds: string[]) {
  return Array.from(new Set(documentIds));
}
