import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { getRagConfig } from "@/lib/rag/config";
import { embedText as defaultEmbedText } from "@/lib/rag/ollama";
import { chunkMarkdownDocument } from "@/lib/rag/chunk-markdown";
import { replaceDocumentChunks as defaultReplaceDocumentChunks } from "@/lib/rag/vector-store";

export type SavedDocumentForIndex = {
  id: string;
  workspaceId: string;
  title: string;
  contentMarkdown: string;
  updatedAt: Date;
};

type EmbedText = (text: string) => Promise<number[]>;
type ReplaceDocumentChunksInput = Parameters<typeof defaultReplaceDocumentChunks>[1];
type ReplaceDocumentChunks = (input: ReplaceDocumentChunksInput) => Promise<void>;

type IndexSavedDocumentInput = {
  document: SavedDocumentForIndex;
  embeddingModel?: string;
  embedText?: EmbedText;
  replaceDocumentChunks?: ReplaceDocumentChunks;
};

type SafeIndexSavedDocumentInput = Omit<IndexSavedDocumentInput, "document"> & {
  documentId: string;
  loadDocument?: (documentId: string) => Promise<SavedDocumentForIndex | null>;
  logger?: (documentId: string, error: unknown) => void;
};

export async function indexSavedDocument(input: IndexSavedDocumentInput) {
  const document = input.document;
  const embeddingModel = input.embeddingModel ?? getRagConfig().embedModel;
  const embedText = input.embedText ?? defaultEmbedText;
  const replaceDocumentChunks = input.replaceDocumentChunks ?? replaceDocumentChunksInTransaction;
  const chunks = chunkMarkdownDocument({
    documentTitle: document.title,
    contentMarkdown: document.contentMarkdown,
  });

  await replaceDocumentChunks({
    documentId: document.id,
    embeddingModel,
    chunks: await Promise.all(
      chunks.map(async (chunk) => ({
        id: randomUUID(),
        workspaceId: document.workspaceId,
        documentId: document.id,
        chunkIndex: chunk.chunkIndex,
        headingPath: chunk.headingPath,
        content: chunk.content,
        contentHash: chunk.contentHash,
        sourceUpdatedAt: document.updatedAt,
        tokenCount: chunk.tokenCount,
        embeddingModel,
        embedding: await embedText(chunk.content),
      })),
    ),
  });
}

export async function safeIndexSavedDocument(input: SafeIndexSavedDocumentInput) {
  try {
    const loadDocument = input.loadDocument ?? loadSavedDocument;
    const document = await loadDocument(input.documentId);
    if (!document) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);

    await indexSavedDocument({
      document,
      embeddingModel: input.embeddingModel,
      embedText: input.embedText,
      replaceDocumentChunks: input.replaceDocumentChunks,
    });
    return true;
  } catch (error) {
    input.logger?.(input.documentId, error);
    return false;
  }
}

async function loadSavedDocument(documentId: string) {
  return prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      contentMarkdown: true,
      updatedAt: true,
    },
  });
}

async function replaceDocumentChunksInTransaction(input: ReplaceDocumentChunksInput) {
  await prisma.$transaction((tx) => defaultReplaceDocumentChunks(tx, input));
}
