export function deriveMarkdownImportTitle({
  fileName,
  contentMarkdown,
}: {
  fileName: string;
  contentMarkdown: string;
}) {
  return (
    frontmatterTitle(contentMarkdown) ??
    firstH1Title(contentMarkdown) ??
    fileNameTitle(fileName) ??
    "Untitled"
  );
}

function frontmatterTitle(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  for (const line of match[1].split(/\r?\n/)) {
    const titleMatch = line.match(/^title:\s*(.+?)\s*$/);
    if (!titleMatch) continue;

    const title = stripYamlStringQuotes(titleMatch[1].trim());
    if (title) return title;
  }

  return null;
}

function firstH1Title(markdown: string) {
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const title = match[1].trim();
    if (title) return title;
  }

  return null;
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
