import { parseDocument } from "yaml";

export type ParsedWikiLink = {
  targetTitleRaw: string;
  alias: string | null;
};

export function parseWikiLinks(markdown: string): ParsedWikiLink[] {
  return parseWikiLinksFromText(markdown);
}

export function parseFrontmatterWikiLinks(markdown: string): ParsedWikiLink[] {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n").trimStart();
  if (!normalizedMarkdown.startsWith("---\n")) return [];

  const end = normalizedMarkdown.indexOf("\n---", 4);
  if (end === -1) return [];

  const raw = normalizedMarkdown.slice(4, end).trim();
  if (!raw) return [];

  const document = parseDocument(raw);
  if (document.errors.length > 0) return [];

  const links = document.toJSON()?.links;
  if (!Array.isArray(links)) return [];

  return parseWikiLinksFromText(
    links.filter((link): link is string => typeof link === "string").join("\n"),
  );
}

function parseWikiLinksFromText(text: string): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = [];
  const seen = new Set<string>();
  const withoutEmbeds = text.replace(/!\[\[[^\]]+\]\]/g, "");

  for (const match of withoutEmbeds.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const raw = match[1]?.trim() ?? "";
    if (!raw || raw.startsWith("#")) continue;

    const [targetPart, aliasPart] = raw.split("|");
    const targetTitleRaw = targetPart?.trim() ?? "";
    if (!targetTitleRaw || targetTitleRaw.startsWith("#")) continue;

    const alias = aliasPart?.trim() ? aliasPart.trim() : null;
    const key = targetTitleRaw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ targetTitleRaw, alias });
  }

  return links;
}
