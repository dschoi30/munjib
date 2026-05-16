export type HeadingFoldEditorRange = {
  fromLine: number;
  toLine: number;
};

export type HeadingFoldSection = {
  key: string;
  level: number;
  title: string;
  headingLine: number;
  bodyMarkdown: string;
  children: HeadingFoldSection[];
  editorRange: HeadingFoldEditorRange | null;
};

export type HeadingFoldTree = {
  sections: HeadingFoldSection[];
  sectionByKey: Map<string, HeadingFoldSection>;
  headingKeys: Set<string>;
};

export type MarkdownOutlineItem = {
  id: string;
  level: number;
  title: string;
  lineNumber: number;
  children: MarkdownOutlineItem[];
};

type LineToken = {
  content: string;
  startOffset: number;
  endOffset: number;
  lineNumber: number;
};

type HeadingToken = {
  level: number;
  title: string;
  slug: string;
  lineNumber: number;
  lineStartOffset: number;
  lineEndOffset: number;
};

type MutableSection = {
  key: string;
  level: number;
  title: string;
  headingLine: number;
  headingEndOffset: number;
  sectionEndOffset: number;
  sectionEndLine: number;
  firstChildStartOffset: number | null;
  children: MutableSection[];
};

export function buildHeadingFoldTree(markdown: string): HeadingFoldTree {
  const headings = findHeadingTokens(markdown);
  const rootSections: MutableSection[] = [];
  const stack: MutableSection[] = [];
  const siblingOccurrences = new Map<string, number>();

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];

    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1] ?? null;
    const parentKey = parent?.key ?? "";
    const occurrenceKey = `${parentKey}|${heading.level}|${heading.slug}`;
    const occurrence = siblingOccurrences.get(occurrenceKey) ?? 0;
    siblingOccurrences.set(occurrenceKey, occurrence + 1);

    const keyPart = `${heading.level}-${heading.slug}-${occurrence}`;
    const key = parentKey ? `${parentKey}/${keyPart}` : keyPart;
    const section: MutableSection = {
      key,
      level: heading.level,
      title: heading.title,
      headingLine: heading.lineNumber,
      headingEndOffset: heading.lineEndOffset,
      sectionEndOffset: getSectionEndOffset(markdown, headings, index),
      sectionEndLine: getSectionEndLine(markdown, headings, index),
      firstChildStartOffset: getFirstChildStartOffset(headings, index),
      children: [],
    };

    if (parent) {
      parent.children.push(section);
    } else {
      rootSections.push(section);
    }

    stack.push(section);
  }

  const sectionByKey = new Map<string, HeadingFoldSection>();
  const headingKeys = new Set<string>();
  const sections = rootSections.map((section) =>
    finalizeSection(section, markdown, sectionByKey, headingKeys),
  );

  return {
    sections,
    sectionByKey,
    headingKeys,
  };
}

export function buildMarkdownOutline(markdown: string): MarkdownOutlineItem[] {
  const tree = buildHeadingFoldTree(markdown);

  return projectOutlineItems(tree.sections);
}

export function getValidFoldedHeadingKeys(
  foldedKeys: Iterable<string>,
  validKeys: Set<string>,
): string[] {
  return Array.from(foldedKeys)
    .filter((key) => validKeys.has(key))
    .sort();
}

export function createHeadingFoldStorageValue(foldedKeys: Set<string>): string {
  return JSON.stringify(Array.from(foldedKeys).sort());
}

export function parseHeadingFoldStorageValue(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function findHeadingTokens(markdown: string): HeadingToken[] {
  const lines = tokenizeLines(markdown);
  const headings: HeadingToken[] = [];
  let inFrontmatter = normalizeLineContent(lines[0]?.content ?? "").trim() === "---";
  let inFence: { marker: "`" | "~"; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const content = normalizeLineContent(line.content);

    if (inFrontmatter) {
      if (index > 0 && content.trim() === "---") {
        inFrontmatter = false;
      }

      continue;
    }

    if (inFence) {
      const closingFence = content.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);

      if (closingFence) {
        const marker = closingFence[1][0] as "`" | "~";
        const length = closingFence[1].length;

        if (inFence.marker === marker && length >= inFence.length) {
          inFence = null;
        }
      }

      continue;
    }

    const openingFence = content.match(/^ {0,3}(`{3,}|~{3,})/);
    if (openingFence) {
      inFence = {
        marker: openingFence[1][0] as "`" | "~",
        length: openingFence[1].length,
      };
      continue;
    }

    const heading = content.match(/^( {0,3})(#{1,6})(?:[ \t]+|$)(.*)$/);

    if (!heading) {
      continue;
    }

    const title = normalizeHeadingTitle(heading[3]);
    const level = heading[2].length;

    headings.push({
      level,
      title,
      slug: slugifyHeadingTitle(title),
      lineNumber: line.lineNumber,
      lineStartOffset: line.startOffset,
      lineEndOffset: line.endOffset,
    });
  }

  return headings;
}

function normalizeLineContent(content: string) {
  return content.endsWith("\r") ? content.slice(0, -1) : content;
}

function tokenizeLines(markdown: string): LineToken[] {
  const tokens: LineToken[] = [];
  let startOffset = 0;
  let lineNumber = 1;

  for (let index = 0; index <= markdown.length; index += 1) {
    if (index !== markdown.length && markdown[index] !== "\n") {
      continue;
    }

    const hasNewline = index < markdown.length;
    const content = markdown.slice(startOffset, index);
    const endOffset = hasNewline ? index + 1 : index;

    if (content.length > 0 || hasNewline || markdown.length === 0) {
      tokens.push({
        content,
        startOffset,
        endOffset,
        lineNumber,
      });
    }

    startOffset = index + 1;
    lineNumber += 1;
  }

  return tokens;
}

function finalizeSection(
  section: MutableSection,
  markdown: string,
  sectionByKey: Map<string, HeadingFoldSection>,
  headingKeys: Set<string>,
): HeadingFoldSection {
  const bodyEndOffset = section.firstChildStartOffset ?? section.sectionEndOffset;
  const bodyMarkdown = markdown.slice(section.headingEndOffset, bodyEndOffset);
  const editorRange =
    section.headingLine < section.sectionEndLine
      ? { fromLine: section.headingLine + 1, toLine: section.sectionEndLine }
      : null;
  const finalizedChildren = section.children.map((child) =>
    finalizeSection(child, markdown, sectionByKey, headingKeys),
  );
  const finalized: HeadingFoldSection = Object.freeze({
    key: section.key,
    level: section.level,
    title: section.title,
    headingLine: section.headingLine,
    bodyMarkdown,
    children: Object.freeze(finalizedChildren) as unknown as HeadingFoldSection[],
    editorRange,
  });

  sectionByKey.set(finalized.key, finalized);
  headingKeys.add(finalized.key);

  return finalized;
}

function projectOutlineItems(sections: HeadingFoldSection[]): MarkdownOutlineItem[] {
  return sections.flatMap((section) => {
    if (section.level > 4 || section.title.length === 0) {
      return [];
    }

    return [
      {
        id: section.key,
        level: section.level,
        title: section.title,
        lineNumber: section.headingLine,
        children: projectOutlineItems(section.children),
      },
    ];
  });
}

function normalizeHeadingTitle(rawTitle: string): string {
  return rawTitle.trim().replace(/[ \t]+#{1,}[ \t]*$/, "").trim();
}

function slugifyHeadingTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "heading";
}

function getLastLineNumber(markdown: string): number {
  return markdown.length === 0 ? 1 : markdown.split("\n").length;
}

function getSectionEndOffset(
  markdown: string,
  headings: HeadingToken[],
  headingIndex: number,
): number {
  const nextSameOrHigher = getNextSameOrHigherHeading(headings, headingIndex);

  return nextSameOrHigher?.lineStartOffset ?? markdown.length;
}

function getSectionEndLine(markdown: string, headings: HeadingToken[], headingIndex: number): number {
  const nextSameOrHigher = getNextSameOrHigherHeading(headings, headingIndex);

  return nextSameOrHigher ? nextSameOrHigher.lineNumber - 1 : getLastLineNumber(markdown);
}

function getFirstChildStartOffset(
  headings: HeadingToken[],
  headingIndex: number,
): number | null {
  const heading = headings[headingIndex];
  const nextHeading = headings[headingIndex + 1];

  return nextHeading && nextHeading.level > heading.level ? nextHeading.lineStartOffset : null;
}

function getNextSameOrHigherHeading(
  headings: HeadingToken[],
  headingIndex: number,
): HeadingToken | undefined {
  const heading = headings[headingIndex];

  return headings.slice(headingIndex + 1).find((candidate) => candidate.level <= heading.level);
}
