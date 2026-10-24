import { createHash, randomUUID } from "node:crypto";
import { after as scheduleAfterRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { getRagModelConfig } from "@/lib/rag/config";
import { embedText as defaultEmbedText } from "@/lib/rag/embedding-client";
import { chunkMarkdownDocument, type RagChunk } from "@/lib/rag/chunk-markdown";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";
import { replaceDocumentChunks as defaultReplaceDocumentChunks } from "@/lib/rag/vector-store";

export type SavedDocumentForIndex = {
  id: string;
  workspaceId: string;
  title: string;
  contentMarkdown: string;
  updatedAt: Date;
};

type EmbedText = (
  text: string,
  options?: Readonly<{ privacySafeLogging?: boolean; signal?: AbortSignal }>,
) => Promise<number[]>;
type ReplaceDocumentChunksInput = Parameters<typeof defaultReplaceDocumentChunks>[1];
type ReplaceDocumentChunks = (input: ReplaceDocumentChunksInput) => Promise<unknown>;
type IsDocumentCurrent = (document: SavedDocumentForIndex) => Promise<boolean>;
type ScheduleAfter = (task: () => unknown | Promise<unknown>) => void;

type IndexSavedDocumentInput = {
  document: SavedDocumentForIndex;
  embeddingModel?: string;
  privacySafeLogging?: boolean;
  signal?: AbortSignal;
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
  const embeddingModel = input.embeddingModel ?? getRagModelConfig().embedding.indexId;
  const embedText = input.embedText ?? defaultEmbedText;
  const replaceDocumentChunks = input.replaceDocumentChunks ?? replaceDocumentChunksInTransaction;
  const chunks = chunkMarkdownDocument({
    documentTitle: document.title,
    contentMarkdown: document.contentMarkdown,
  });
  const embeddedChunks = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    throwIfAborted(input.signal);
    let embedding: number[];
    try {
      embedding = input.privacySafeLogging || input.signal
        ? await embedText(chunk.content, {
            ...(input.privacySafeLogging ? { privacySafeLogging: true } : {}),
            ...(input.signal ? { signal: input.signal } : {}),
          })
        : await embedText(chunk.content);
    } catch (error) {
      throwIfAborted(input.signal);
      // The whitespace chunk budget is not a provider tokenizer. Preserve all
      // source text and retry smaller pieces only for a definite input limit.
      if (!(error instanceof Error) || error.message !== RAG_ERROR_CODES.EMBEDDING_INPUT_TOO_LONG) throw error;
      const pieces = splitRejectedEmbeddingChunk(chunk);
      if (pieces.length === 0) throw error;
      chunks.splice(index, 1, ...pieces);
      index -= 1;
      continue;
    }
    throwIfAborted(input.signal);
    embeddedChunks.push({
      id: randomUUID(),
      workspaceId: document.workspaceId,
      documentId: document.id,
      chunkIndex: embeddedChunks.length,
      headingPath: chunk.headingPath,
      content: chunk.content,
      contentHash: chunk.contentHash,
      sourceUpdatedAt: document.updatedAt,
      tokenCount: chunk.tokenCount,
      embeddingModel,
      embedding,
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

function splitRejectedEmbeddingChunk(chunk: RagChunk): RagChunk[] {
  const points = Array.from(chunk.content);
  if (points.length < 2) return [];
  const midpoint = Math.floor(points.length / 2);
  return [points.slice(0, midpoint).join(""), points.slice(midpoint).join("")].map((content) => ({
    ...chunk,
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
    tokenCount: content.split(/\s+/u).filter(Boolean).length,
  }));
}

export async function safeIndexSavedDocument(input: SafeIndexSavedDocumentInput) {
  try {
    const loadDocument = input.loadDocument ?? loadSavedDocument;
    const document = await loadDocument(input.documentId);
    if (!document) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);

    return await indexSavedDocument({
      document,
      embeddingModel: input.embeddingModel,
      privacySafeLogging: input.privacySafeLogging,
      signal: input.signal,
      embedText: input.embedText,
      replaceDocumentChunks: input.replaceDocumentChunks,
      isDocumentCurrent: input.isDocumentCurrent ?? isSavedDocumentCurrent,
    });
  } catch (error) {
    input.logger?.(input.documentId, error);
    return false;
  }
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Aborted", "AbortError");
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
