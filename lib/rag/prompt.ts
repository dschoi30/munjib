import type { CurrentDocumentContext } from "@/lib/rag/document-context";
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

type BuildDirectDocumentPromptInput = {
  question: string;
  currentDocumentContext: CurrentDocumentContext;
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
      "Only cite context that directly supports the answer; if there is not enough evidence, do not include citations.",
    ].join(" "),
    user: [`Question:\n${input.question.trim()}`, `Saved document context:\n${context}`].join("\n\n"),
    citations,
  };
}

export function buildDirectDocumentPrompt(input: BuildDirectDocumentPromptInput): RagPrompt {
  const citations = input.currentDocumentContext.sections.map((section) => ({
    index: section.index,
    documentId: "current",
    documentTitle: section.documentTitle,
    documentPath: section.documentPath,
    headingPath: section.headingPath,
  }));
  const sectionMap =
    input.currentDocumentContext.sections.length > 0
      ? input.currentDocumentContext.sections
          .map((section) => citationLabel(section.index, section))
          .join("\n")
      : "No current document sections were available.";
  const context =
    input.currentDocumentContext.labeledContext?.trim() ||
    input.currentDocumentContext.context.trim() ||
    "The current saved document is empty.";
  const partialNote = input.currentDocumentContext.partial
    ? "Only selected sections of this long document were included."
    : null;

  return {
    system: [
      "You are Munjib's current-document AI assistant.",
      "Use only the current saved document context provided in this request.",
      "Do not use other workspace documents.",
      "Do not use unsaved editor drafts, draft titles, or draft markdown.",
      "Do not use outside knowledge.",
      "If the current saved document does not contain enough evidence, say that the current saved document does not contain enough evidence to answer.",
      "Answer in the same language as the question where possible.",
      "Cite supporting context with bracketed citation numbers like [1].",
      "Only cite current document sections that directly support the answer; if there is not enough evidence, do not include citations.",
    ].join(" "),
    user: [
      `Question:\n${input.question.trim()}`,
      `Current saved document sections:\n${sectionMap}`,
      `Current saved document context:\n${context}`,
      partialNote,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n\n"),
    citations,
  };
}

export function filterCitationsToAnswer(answer: string, citations: RagCitation[]) {
  const referencedIndices = new Set<number>();
  for (const match of answer.matchAll(/\[([\d,\s]+)\]/g)) {
    for (const token of match[1]!.split(",")) {
      const index = Number.parseInt(token.trim(), 10);
      if (Number.isInteger(index)) referencedIndices.add(index);
    }
  }
  if (referencedIndices.size === 0) return [];

  return citations.filter((citation) => referencedIndices.has(citation.index));
}

function citationLabel(
  index: number,
  citationSource: Pick<RagCitation, "documentTitle" | "headingPath">,
) {
  const headingSuffix = citationSource.headingPath ? ` > ${citationSource.headingPath}` : "";
  return `[${index}] ${citationSource.documentTitle}${headingSuffix}`;
}
