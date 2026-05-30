import { createHash } from "node:crypto";
import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";

export type RagChunk = {
  chunkIndex: number;
  headingPath: string | null;
  content: string;
  contentHash: string;
  tokenCount: number;
};

type ChunkInput = {
  documentTitle: string;
  contentMarkdown: string;
  maxTokens?: number;
  overlapTokens?: number;
};

type Section = {
  headingPath: string | null;
  lines: string[];
};

type FenceMarker = {
  marker: string;
};

type MarkdownBlock = {
  kind: "fence" | "table" | "text";
  content: string;
  tokenCount: number;
};

export function chunkMarkdownDocument(input: ChunkInput): RagChunk[] {
  const maxTokens = normalizeMaxTokens(input.maxTokens ?? 1000);
  const overlapTokens = normalizeOverlapTokens(input.overlapTokens ?? 120, maxTokens);
  const body = stripDocumentFrontmatter(input.contentMarkdown).trim();
  if (!body) return [];

  const chunks: RagChunk[] = [];
  for (const section of splitIntoSections(body)) {
    for (const content of splitSection(section.lines.join("\n").trim(), maxTokens, overlapTokens)) {
      if (!content) continue;
      chunks.push({
        chunkIndex: chunks.length,
        headingPath: section.headingPath,
        content,
        contentHash: hashContent(content),
        tokenCount: estimateTokens(content),
      });
    }
  }
  return chunks;
}

function splitIntoSections(markdown: string): Section[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];
  let current: Section | null = null;
  let activeFence: FenceMarker | null = null;

  const pushCurrent = () => {
    if (current && current.lines.join("\n").trim()) {
      sections.push(current);
    }
  };

  for (const line of lines) {
    const openingFence = activeFence ? null : parseFenceMarker(line);
    if (openingFence) {
      activeFence = openingFence;
    } else if (activeFence && isFenceClose(line, activeFence)) {
      activeFence = null;
    }

    const heading = !activeFence ? line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (heading) {
      pushCurrent();
      const level = heading[1].length;
      const text = heading[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      current = { headingPath: headingStack.map((item) => item.text).join(" > "), lines: [line] };
      continue;
    }

    if (!current) {
      current = { headingPath: null, lines: [] };
    }
    current.lines.push(line);
  }

  pushCurrent();
  return sections;
}

function splitSection(section: string, maxTokens: number, overlapTokens: number): string[] {
  if (estimateTokens(section) <= maxTokens) return [section];

  const chunks: string[] = [];
  const currentBlocks: string[] = [];
  let currentTokenCount = 0;

  const flushCurrent = () => {
    const content = joinBlocks(currentBlocks);
    if (content) chunks.push(content);
    currentBlocks.length = 0;
    currentTokenCount = 0;
  };

  for (const block of splitMarkdownBlocks(section)) {
    if (block.tokenCount > maxTokens) {
      if (block.kind === "fence" || block.kind === "table") {
        flushCurrent();
        chunks.push(block.content);
        continue;
      }

      if (currentBlocks.length === 0) {
        chunks.push(...splitTokenText(block.content, maxTokens, maxTokens, overlapTokens));
        continue;
      }

      const firstLimit = Math.max(1, maxTokens - currentTokenCount);
      const [firstPiece, ...remainingPieces] = splitTokenText(block.content, firstLimit, maxTokens, overlapTokens);
      if (firstPiece) {
        currentBlocks.push(firstPiece);
        chunks.push(joinBlocks(currentBlocks));
      }
      currentBlocks.length = 0;
      currentTokenCount = 0;
      chunks.push(...remainingPieces);
      continue;
    }

    if (currentTokenCount > 0 && currentTokenCount + block.tokenCount > maxTokens) {
      flushCurrent();
    }

    currentBlocks.push(block.content);
    currentTokenCount += block.tokenCount;
  }

  flushCurrent();
  return chunks;
}

function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }
    if (index >= lines.length) break;

    const openingFence = parseFenceMarker(lines[index]);
    if (openingFence) {
      const blockLines = [lines[index]];
      index += 1;
      while (index < lines.length) {
        blockLines.push(lines[index]);
        const closesFence = isFenceClose(lines[index], openingFence);
        index += 1;
        if (closesFence) break;
      }
      blocks.push(createBlock("fence", blockLines));
      continue;
    }

    if (isTableStart(lines, index)) {
      const blockLines = [lines[index], lines[index + 1]!];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        blockLines.push(lines[index]);
        index += 1;
      }
      blocks.push(createBlock("table", blockLines));
      continue;
    }

    const blockLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (blockLines.length > 0 && (parseFenceMarker(lines[index]) || isTableStart(lines, index))) {
        break;
      }
      blockLines.push(lines[index]);
      index += 1;
    }
    blocks.push(createBlock("text", blockLines));
  }

  return blocks;
}

function createBlock(kind: MarkdownBlock["kind"], lines: string[]): MarkdownBlock {
  const content = lines.join("\n").trim();
  return { kind, content, tokenCount: estimateTokens(content) };
}

function joinBlocks(blocks: string[]) {
  return blocks.join("\n\n").trim();
}

function splitTokenText(text: string, firstMaxTokens: number, maxTokens: number, overlapTokens: number) {
  const tokens = tokenize(text);
  const chunks: string[] = [];
  let start = 0;
  let limit = firstMaxTokens;

  while (start < tokens.length) {
    const end = Math.min(tokens.length, start + limit);
    chunks.push(tokens.slice(start, end).join(" "));
    if (end === tokens.length) break;

    const nextStart = end - overlapTokens;
    start = nextStart <= start ? end : nextStart;
    limit = maxTokens;
  }

  return chunks;
}

function tokenize(value: string) {
  return value.split(/\s+/).filter(Boolean);
}

function estimateTokens(value: string) {
  return tokenize(value).length;
}

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeMaxTokens(maxTokens: number) {
  return Math.max(1, Math.floor(maxTokens));
}

function normalizeOverlapTokens(overlapTokens: number, maxTokens: number) {
  return Math.min(Math.max(0, Math.floor(overlapTokens)), Math.max(0, maxTokens - 1));
}

function parseFenceMarker(line: string): FenceMarker | null {
  const marker = line.trim().match(/^(`{3,}|~{3,})/)?.[1];
  return marker ? { marker } : null;
}

function isFenceClose(line: string, fence: FenceMarker) {
  const trimmed = line.trim();
  return trimmed.startsWith(fence.marker) && trimmed.slice(fence.marker.length).trim() === "";
}

function isTableStart(lines: string[], index: number) {
  return isTableRow(lines[index]) && isTableDelimiter(lines[index + 1]);
}

function isTableRow(line: string | undefined) {
  return Boolean(line?.trim().match(/^\|.*\|$/));
}

function isTableDelimiter(line: string | undefined) {
  return Boolean(line?.trim().match(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/));
}
