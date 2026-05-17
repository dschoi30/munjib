import { renderPreviewMarkdownWithWikiLinks } from "@/lib/wiki-links/preview";

export function remarkPreviewSoftLineBreaks() {
  return (tree: unknown) => {
    visitMarkdownParents(tree);
  };
}

function visitMarkdownParents(node: unknown) {
  if (!node || typeof node !== "object") {
    return;
  }

  const parent = node as { children?: unknown[] };

  if (!Array.isArray(parent.children)) {
    return;
  }

  parent.children = parent.children.flatMap((child) => splitMarkdownSoftLineBreaks(child));
  parent.children.forEach(visitMarkdownParents);
}

function splitMarkdownSoftLineBreaks(node: unknown) {
  if (!node || typeof node !== "object") {
    return [node];
  }

  const textNode = node as { type?: string; value?: string };

  if (textNode.type !== "text" || typeof textNode.value !== "string" || !textNode.value.includes("\n")) {
    return [node];
  }

  const parts = textNode.value.split("\n");
  return parts.flatMap((part, index) => {
    const nodes: Array<{ type: string; value?: string }> = [];

    if (index > 0) {
      nodes.push({ type: "break" });
    }

    if (part.length > 0) {
      nodes.push({ type: "text", value: part });
    }

    return nodes;
  });
}

export function markdownInlineToPlainText(markdown: string) {
  return markdown
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias: string | undefined) =>
      alias ?? target,
    )
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .trim();
}

export function getMarkdownBeforeFirstHeading(markdown: string) {
  let inFence: { marker: "`" | "~"; length: number } | null = null;

  for (const line of tokenizeMarkdownLines(markdown)) {
    inFence = getNextFenceState(line.content, inFence);

    if (!inFence && /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line.content)) {
      return markdown.slice(0, line.startOffset);
    }
  }

  return markdown;
}

export function getSharedMarkdownDefinitions(markdown: string) {
  const definitions: string[] = [];
  let inFence: { marker: "`" | "~"; length: number } | null = null;

  const lines = tokenizeMarkdownLines(markdown);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].content;

    if (inFence) {
      inFence = getNextFenceState(line, inFence);
      continue;
    }

    const nextFenceState = getNextFenceState(line, inFence);
    if (nextFenceState) {
      inFence = nextFenceState;
      continue;
    }

    if (isMarkdownDefinitionLine(line)) {
      definitions.push(line);

      for (index += 1; index < lines.length; index += 1) {
        const continuationLine = lines[index].content;

        if (!isMarkdownDefinitionContinuationLine(continuationLine)) {
          index -= 1;
          break;
        }

        definitions.push(continuationLine);
      }
    }
  }

  return definitions.join("\n");
}

function tokenizeMarkdownLines(markdown: string) {
  const lines: Array<{ content: string; startOffset: number }> = [];
  let startOffset = 0;

  for (let index = 0; index <= markdown.length; index += 1) {
    if (index !== markdown.length && markdown[index] !== "\n") {
      continue;
    }

    const hasNewline = index < markdown.length;
    const rawContent = markdown.slice(startOffset, index);

    if (rawContent.length > 0 || hasNewline || markdown.length === 0) {
      lines.push({
        content: rawContent.endsWith("\r") ? rawContent.slice(0, -1) : rawContent,
        startOffset,
      });
    }

    startOffset = index + 1;
  }

  return lines;
}

function getNextFenceState(
  content: string,
  inFence: { marker: "`" | "~"; length: number } | null,
) {
  if (inFence) {
    const closingFence = content.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);

    if (!closingFence) {
      return inFence;
    }

    const marker = closingFence[1][0] as "`" | "~";
    const length = closingFence[1].length;

    return inFence.marker === marker && length >= inFence.length ? null : inFence;
  }

  const openingFence = content.match(/^ {0,3}(`{3,}|~{3,})/);

  return openingFence
    ? {
        marker: openingFence[1][0] as "`" | "~",
        length: openingFence[1].length,
      }
    : null;
}

export function renderPreviewChunk(
  markdown: string,
  candidateBySlug: Parameters<typeof renderPreviewMarkdownWithWikiLinks>[1],
  sharedDefinitions: string,
) {
  const markdownWithDefinitions = sharedDefinitions ? `${markdown}\n\n${sharedDefinitions}` : markdown;

  return renderPreviewMarkdownWithWikiLinks(markdownWithDefinitions, candidateBySlug);
}

function isMarkdownDefinitionLine(line: string) {
  return /^ {0,3}\[(?:\^[^\]\n]+|[^\]\n]+)\]:[ \t]*(?:\S.*)?$/.test(line);
}

function isMarkdownDefinitionContinuationLine(line: string) {
  return line.trim().length === 0 || /^[ \t]/.test(line);
}
