export type ActiveWikiLinkCompletion = {
  from: number;
  to: number;
  query: string;
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
