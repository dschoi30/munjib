import type { Language } from "@/lib/i18n/language";
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
  uiLanguage?: Language;
};

type BuildDirectDocumentPromptInput = {
  question: string;
  currentDocumentContext: CurrentDocumentContext;
  uiLanguage?: Language;
};

const PROMPT_UI_LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  ko: "Korean",
};

const PROMPT_FALLBACKS: Record<
  Language,
  {
    noSavedDocumentContext: string;
    noCurrentDocumentSections: string;
    emptyCurrentDocument: string;
  }
> = {
  en: {
    noSavedDocumentContext: "No saved document context was retrieved.",
    noCurrentDocumentSections: "No current document sections were available.",
    emptyCurrentDocument: "The current saved document is empty.",
  },
  ko: {
    noSavedDocumentContext: "저장된 문서 맥락을 찾지 못했습니다.",
    noCurrentDocumentSections: "현재 문서 섹션을 찾지 못했습니다.",
    emptyCurrentDocument: "현재 저장된 문서가 비어 있습니다.",
  },
};

export function buildRagPrompt(input: BuildRagPromptInput): RagPrompt {
  const uiLanguage = input.uiLanguage ?? "en";
  const fallback = PROMPT_FALLBACKS[uiLanguage];
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
      : fallback.noSavedDocumentContext;

  return {
    system: [
      "You are Munjib's document AI assistant.",
      "Use only the saved document context provided in this request.",
      "Do not use unsaved editor drafts, draft titles, or draft markdown.",
      "Do not use outside knowledge.",
      "If the saved documents do not contain enough evidence, say that the saved documents do not contain enough evidence to answer.",
      selectedUiLanguageInstruction(input.uiLanguage),
      "Answer in the same language as the question where possible.",
      "Cite supporting context with bracketed citation numbers like [1].",
      "Only cite context that directly supports the answer; if there is not enough evidence, do not include citations.",
    ].filter((part): part is string => Boolean(part)).join(" "),
    user: [`Question:\n${input.question.trim()}`, `Saved document context:\n${context}`].join("\n\n"),
    citations,
  };
}

export function buildDirectDocumentPrompt(input: BuildDirectDocumentPromptInput): RagPrompt {
  const uiLanguage = input.uiLanguage ?? "en";
  const fallback = PROMPT_FALLBACKS[uiLanguage];
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
      : fallback.noCurrentDocumentSections;
  const context =
    input.currentDocumentContext.labeledContext?.trim() ||
    input.currentDocumentContext.context.trim() ||
    fallback.emptyCurrentDocument;
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
      selectedUiLanguageInstruction(input.uiLanguage),
      "Answer in the same language as the question where possible.",
      "Cite supporting context with bracketed citation numbers like [1].",
      "Only cite current document sections that directly support the answer; if there is not enough evidence, do not include citations.",
    ].filter((part): part is string => Boolean(part)).join(" "),
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

export function normalizeAnswerCitations(answer: string, citations: RagCitation[]) {
  const citationByIndex = new Map(citations.map((citation) => [citation.index, citation]));
  const displayIndexBySourceIndex = new Map<number, number>();
  const normalizedCitations: RagCitation[] = [];
  const normalizedAnswer = answer.replace(/\[([\d,\s]+)\]/g, (match, group: string) => {
    const displayIndices: number[] = [];

    for (const token of group.split(",")) {
      const sourceIndex = Number.parseInt(token.trim(), 10);
      const citation = citationByIndex.get(sourceIndex);
      if (!citation) continue;

      let displayIndex = displayIndexBySourceIndex.get(sourceIndex);
      if (!displayIndex) {
        displayIndex = normalizedCitations.length + 1;
        displayIndexBySourceIndex.set(sourceIndex, displayIndex);
        normalizedCitations.push({ ...citation, index: displayIndex });
      }
      if (!displayIndices.includes(displayIndex)) displayIndices.push(displayIndex);
    }

    return displayIndices.length > 0 ? `[${displayIndices.join(", ")}]` : match;
  });

  return {
    answer: normalizedAnswer,
    citations: normalizedCitations,
  };
}

function selectedUiLanguageInstruction(uiLanguage: Language | undefined) {
  if (!uiLanguage) return null;
  return `The selected UI language is ${PROMPT_UI_LANGUAGE_NAMES[uiLanguage]}. Use it for fallback or status phrasing, but answer in the same language as the question where possible.`;
}

function citationLabel(
  index: number,
  citationSource: Pick<RagCitation, "documentTitle" | "headingPath">,
) {
  const headingSuffix = citationSource.headingPath ? ` > ${citationSource.headingPath}` : "";
  return `[${index}] ${citationSource.documentTitle}${headingSuffix}`;
}
