import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";

export type CurrentDocumentContextSection = {
  index: number;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
};

export type CurrentDocumentContext = {
  context: string;
  sections: CurrentDocumentContextSection[];
  partial: boolean;
};

type BuildCurrentDocumentContextInput = {
  documentTitle: string;
  documentPath: string;
  contentMarkdown: string;
  question: string;
  maxTokens?: number;
};

type MarkdownSection = {
  headingPath: string | null;
  content: string;
};

type SectionCandidate = MarkdownSection & {
  tokenCount: number;
  score: number;
  order: number;
};

const DEFAULT_CONTEXT_TOKEN_BUDGET = 8_000;
const LATIN_KEYWORD_TERM_MIN_LENGTH = 3;
const CJK_KEYWORD_TERM_MIN_LENGTH = 2;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "then",
  "this",
  "to",
  "was",
  "we",
  "with",
  "you",
  "your",
]);

export function buildCurrentDocumentContext(
  input: BuildCurrentDocumentContextInput,
): CurrentDocumentContext {
  const body = stripDocumentFrontmatter(input.contentMarkdown).trim();
  if (!body) return { context: "", sections: [], partial: false };

  const budget = Math.max(1, Math.floor(input.maxTokens ?? DEFAULT_CONTEXT_TOKEN_BUDGET));
  const sections = splitIntoHeadingSections(body).map((section, order) => ({
    ...section,
    tokenCount: estimateTokens(section.content),
    score: scoreSection(section, input.question),
    order,
  }));

  if (estimateTokens(body) <= budget) {
    return {
      context: body,
      sections: sections.map((section, index) => toContextSection(section, input, index + 1)),
      partial: false,
    };
  }

  const selectedSections = selectSectionsWithinBudget(sections, budget);
  return {
    context: selectedSections.map((section) => section.content).join("\n\n"),
    sections: selectedSections.map((section, index) =>
      toContextSection(section, input, index + 1),
    ),
    partial: true,
  };
}

export function estimateTokens(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;

  return Math.ceil(normalized.length / 4);
}

function splitIntoHeadingSections(markdown: string): MarkdownSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: MarkdownSection[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];
  let currentHeadingPath: string | null = null;
  let currentLines: string[] = [];
  let activeFence: string | null = null;

  const flushCurrent = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      sections.push({ headingPath: currentHeadingPath, content });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const openingFence: string | null = activeFence === null ? parseFenceMarker(line) : null;
    if (openingFence !== null) {
      activeFence = openingFence;
    } else if (activeFence !== null && isFenceClose(line, activeFence)) {
      activeFence = null;
    }

    const heading = activeFence === null ? parseHeading(line) : null;
    if (heading) {
      flushCurrent();
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1]!.level >= heading.level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level: heading.level, text: heading.text });
      currentHeadingPath = headingStack.map((item) => item.text).join(" > ");
    }

    currentLines.push(line);
  }

  flushCurrent();
  return sections.length > 0 ? sections : [{ headingPath: null, content: markdown.trim() }];
}

function scoreSection(section: MarkdownSection, question: string) {
  const questionTerms = normalizedKeywordTerms(question);
  const headingTerms = normalizedKeywordTerms(section.headingPath ?? "");
  const contentTerms = normalizedKeywordTerms(section.content);
  let score = 0;

  for (const term of questionTerms) {
    if (headingTerms.has(term)) score += 2;
    if (contentTerms.has(term)) score += 1;
  }

  return score;
}

function selectSectionsWithinBudget(sections: SectionCandidate[], budget: number) {
  const rankedSections = [...sections].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.order - right.order;
  });
  const selectedSections: SectionCandidate[] = [];
  let usedTokens = 0;

  for (const section of rankedSections) {
    if (selectedSections.length > 0 && usedTokens + section.tokenCount > budget) continue;

    if (section.tokenCount > budget && selectedSections.length === 0) {
      selectedSections.push({
        ...section,
        content: truncateToBudget(section.content, budget),
        tokenCount: budget,
      });
      break;
    }

    selectedSections.push(section);
    usedTokens += section.tokenCount;
  }

  return selectedSections.sort((left, right) => left.order - right.order);
}

function truncateToBudget(content: string, budget: number) {
  const maxChars = Math.max(1, budget * 4);
  if (content.length <= maxChars) return content;

  return content.slice(0, maxChars).trimEnd();
}

function toContextSection(
  section: Pick<SectionCandidate, "headingPath">,
  input: Pick<BuildCurrentDocumentContextInput, "documentTitle" | "documentPath">,
  index: number,
): CurrentDocumentContextSection {
  return {
    index,
    documentTitle: input.documentTitle,
    documentPath: input.documentPath,
    headingPath: section.headingPath,
  };
}

function normalizedKeywordTerms(text: string) {
  const tokens = text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(tokens.filter(isKeywordCandidate));
}

function isKeywordCandidate(term: string) {
  if (STOP_WORDS.has(term)) return false;
  if (/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term)) {
    return term.length >= CJK_KEYWORD_TERM_MIN_LENGTH;
  }

  return term.length >= LATIN_KEYWORD_TERM_MIN_LENGTH;
}

function parseFenceMarker(line: string): string | null {
  return line.match(/^[ \t]{0,3}(`{3,}|~{3,})/)?.[1] ?? null;
}

function isFenceClose(line: string, fence: string): boolean {
  const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);
  if (!match) return false;

  const marker = match[1];
  return marker[0] === fence[0] && marker.length >= fence.length;
}

function parseHeading(line: string): { level: number; text: string } | null {
  const heading = line.match(/^[ \t]{0,3}(#{1,6})[ \t]+(.+?)\s*$/);
  if (!heading) return null;

  const closingMarker = heading[2]!.match(/^(.*?)[ \t]+#+[ \t]*$/);
  return {
    level: heading[1]!.length,
    text: (closingMarker?.[1] ?? heading[2]!).trim(),
  };
}
