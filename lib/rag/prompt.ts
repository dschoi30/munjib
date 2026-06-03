import type { RetrievedChunk } from "@/lib/rag/vector-store";

export type RagCitation = {
  index: number;
  documentId: string;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
};

export type RagPrompt = {
  system: string;
  user: string;
  citations: RagCitation[];
};

type PromptChunk = RetrievedChunk & { score?: number };

type BuildRagPromptInput = {
  question: string;
  chunks: PromptChunk[];
};

export function buildRagPrompt(input: BuildRagPromptInput): RagPrompt {
  const citations = input.chunks.map((chunk, index) => ({
    index: index + 1,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    documentPath: chunk.documentPath,
    headingPath: chunk.headingPath,
  }));

  const context =
    input.chunks.length > 0
      ? input.chunks
          .map((chunk, index) => `${citationLabel(index + 1, chunk)}\n${chunk.content.trim()}`)
          .join("\n\n")
      : "No saved document context was retrieved.";

  return {
    system: [
      "You are Munjib's document AI assistant.",
      "Use only the saved document context provided in this request.",
      "Do not use unsaved editor drafts, draft titles, or draft markdown.",
      "Do not use outside knowledge.",
      "If the saved documents do not contain enough evidence, say that the saved documents do not contain enough evidence to answer.",
      "Answer in the same language as the question where possible.",
      "Cite supporting context with bracketed citation numbers like [1].",
    ].join(" "),
    user: [`Question:\n${input.question.trim()}`, `Saved document context:\n${context}`].join("\n\n"),
    citations,
  };
}

function citationLabel(index: number, chunk: PromptChunk) {
  const headingSuffix = chunk.headingPath ? ` > ${chunk.headingPath}` : "";
  return `[${index}] ${chunk.documentTitle}${headingSuffix}`;
}
