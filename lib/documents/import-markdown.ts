export function deriveMarkdownImportTitle({
  fileName,
  contentMarkdown,
}: {
  fileName: string;
  contentMarkdown: string;
}) {
  return (
    fileNameTitle(fileName) ??
    frontmatterTitle(contentMarkdown) ??
    firstH1Title(contentMarkdown) ??
    "Untitled"
  );
}

export function isSupportedMarkdownImportFile(file: {
  name: string;
  type: string;
  size: number;
}) {
  if (file.size === 0) return false;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return (
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    type === "text/markdown" ||
    type === "text/x-markdown"
  );
}

function frontmatterTitle(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  for (const line of match[1].split(/\r?\n/)) {
    const titleMatch = line.match(/^title:\s*(.+?)\s*$/);
    if (!titleMatch) continue;

    const title = stripYamlStringQuotes(titleMatch[1].trim());
    if (isYamlBlockScalarMarker(title)) return null;
    if (title) return title;
  }

  return null;
}

function firstH1Title(markdown: string) {
  let inFence = false;
  let fenceMarker: "`" | "~" | null = null;
  let fenceLength = 0;

  for (const line of lines(markdown)) {
    const fenceMatch = line.trimStart().match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        fenceLength = fenceMatch[1].length;
        continue;
      }

      if (marker === fenceMarker && fenceMatch[1].length >= fenceLength) {
        inFence = false;
        fenceMarker = null;
        fenceLength = 0;
        continue;
      }
    }

    if (inFence) continue;

    const match = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const title = match[1].trim();
    if (title) return title;
  }

  return null;
}

function* lines(text: string) {
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") continue;

    yield stripTrailingCarriageReturn(text.slice(start, index));
    start = index + 1;
  }

  if (start <= text.length) {
    yield stripTrailingCarriageReturn(text.slice(start));
  }
}

function fileNameTitle(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim();
  if (!baseName) return null;

  const title = baseName.replace(/\.(?:md|markdown)$/i, "").trim();
  return title || null;
}

function stripYamlStringQuotes(value: string) {
  const singleQuoted = value.match(/^'(.*)'$/);
  if (singleQuoted) return singleQuoted[1].trim();

  const doubleQuoted = value.match(/^"(.*)"$/);
  if (doubleQuoted) return doubleQuoted[1].trim();

  return value.trim();
}

function isYamlBlockScalarMarker(value: string) {
  return /^[|>][+-]?$/.test(value);
}

function stripTrailingCarriageReturn(value: string) {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}
