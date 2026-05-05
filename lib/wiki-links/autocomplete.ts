import { pathToWikiTarget } from "@/lib/folders/path";

export type ActiveWikiLinkCompletion = {
  from: number;
  to: number;
  query: string;
};

export type WikiLinkCompletionCandidate = {
  id: string;
  title: string;
  path: string;
};

export type WikiLinkCompletionOption = {
  id: string;
  label: string;
  insertText: string;
};

export function getActiveWikiLinkCompletion(
  markdown: string,
  cursorPosition: number,
): ActiveWikiLinkCompletion | null {
  const cursor = Math.max(0, Math.min(cursorPosition, markdown.length));
  const beforeCursor = markdown.slice(0, cursor);
  const openIndex = beforeCursor.lastIndexOf("[[");

  if (openIndex === -1) return null;
  if (beforeCursor.lastIndexOf("]]") > openIndex) return null;
  if (beforeCursor[openIndex - 1] === "!") return null;

  const query = beforeCursor.slice(openIndex + 2);
  if (query.includes("\n") || query.includes("[") || query.includes("|")) return null;

  return {
    from: openIndex,
    to: cursor,
    query: query.trim(),
  };
}

export function getWikiLinkCompletionOptions(
  query: string,
  candidates: WikiLinkCompletionCandidate[],
): WikiLinkCompletionOption[] {
  const normalizedQuery = query.toLowerCase().trim();
  const titleCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const titleKey = candidate.title.toLowerCase();
    titleCounts.set(titleKey, (titleCounts.get(titleKey) ?? 0) + 1);
  }

  return candidates
    .filter((candidate) => {
      const target = pathToWikiTarget(candidate.path).toLowerCase();
      return (
        candidate.title.toLowerCase().includes(normalizedQuery) ||
        target.includes(normalizedQuery)
      );
    })
    .slice(0, 6)
    .map((candidate) => {
      const duplicateTitle = (titleCounts.get(candidate.title.toLowerCase()) ?? 0) > 1;
      const target = duplicateTitle ? pathToWikiTarget(candidate.path) : candidate.title;
      return {
        id: candidate.id,
        label: duplicateTitle ? target : candidate.title,
        insertText: `[[${target}]]`,
      };
    });
}
