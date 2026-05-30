import { randomUUID } from "node:crypto";
import { after as scheduleAfterRequest } from "next/server";
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
type ReplaceDocumentChunks = (input: ReplaceDocumentChunksInput) => Promise<unknown>;
type IsDocumentCurrent = (document: SavedDocumentForIndex) => Promise<boolean>;
type ScheduleAfter = (task: () => unknown | Promise<unknown>) => void;

type IndexSavedDocumentInput = {
  document: SavedDocumentForIndex;
  embeddingModel?: string;
  embedText?: EmbedText;
  replaceDocumentChunks?: ReplaceDocumentChunks;
  isDocumentCurrent?: IsDocumentCurrent;
};

type SafeIndexSavedDocumentInput = Omit<IndexSavedDocumentInput, "document"> & {
  documentId: string;
  loadDocument?: (documentId: string) => Promise<SavedDocumentForIndex | null>;
  logger?: (documentId: string, error: unknown) => void;
};

type ScheduleSavedDocumentIndexInput = SafeIndexSavedDocumentInput & {
  scheduleAfter?: ScheduleAfter;
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
  const embeddedChunks = [];
  for (const chunk of chunks) {
    embeddedChunks.push({
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
    });
  }

  if (input.isDocumentCurrent && !(await input.isDocumentCurrent(document))) {
    return false;
  }

  const replaced = await replaceDocumentChunks({
    documentId: document.id,
    embeddingModel,
    sourceUpdatedAt: document.updatedAt,
    chunks: embeddedChunks,
  });
  return replaced !== false;
}

export async function safeIndexSavedDocument(input: SafeIndexSavedDocumentInput) {
  try {
    const loadDocument = input.loadDocument ?? loadSavedDocument;
    const document = await loadDocument(input.documentId);
    if (!document) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);

    return await indexSavedDocument({
      document,
      embeddingModel: input.embeddingModel,
      embedText: input.embedText,
      replaceDocumentChunks: input.replaceDocumentChunks,
      isDocumentCurrent: input.isDocumentCurrent ?? isSavedDocumentCurrent,
    });
  } catch (error) {
    input.logger?.(input.documentId, error);
    return false;
  }
}

export function scheduleSavedDocumentIndex(input: ScheduleSavedDocumentIndexInput) {
  if (shouldSkipDefaultScheduledIndex(input)) return;
  const { scheduleAfter = scheduleAfterRequest, ...indexInput } = input;
  scheduleAfter(() => safeIndexSavedDocument(indexInput));
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

async function isSavedDocumentCurrent(document: SavedDocumentForIndex) {
  const current = await prisma.document.findUnique({
    where: { id: document.id },
    select: { updatedAt: true },
  });

  return current?.updatedAt.getTime() === document.updatedAt.getTime();
}

function shouldSkipDefaultScheduledIndex(input: ScheduleSavedDocumentIndexInput) {
  return (
    process.env.NODE_ENV === "test" &&
    !input.loadDocument &&
    !input.embedText &&
    !input.replaceDocumentChunks &&
    !input.isDocumentCurrent &&
    !input.scheduleAfter
  );
}

async function replaceDocumentChunksInTransaction(input: ReplaceDocumentChunksInput) {
  return prisma.$transaction((tx) => defaultReplaceDocumentChunks(tx, input));
}
