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

  return parseFrontmatterLinkValues(links.filter((link): link is string => typeof link === "string"));
}

function parseWikiLinksFromText(text: string, seen = new Set<string>()): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = [];
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

function parseFrontmatterLinkValues(values: string[]): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const parsed = parseWikiLinksFromText(value, seen);
    if (parsed.length > 0) {
      links.push(...parsed);
      continue;
    }

    const targetTitleRaw = value.trim();
    if (!isPlainFrontmatterLinkTarget(targetTitleRaw)) continue;

    const key = targetTitleRaw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ targetTitleRaw, alias: null });
  }

  return links;
}

function isPlainFrontmatterLinkTarget(targetTitleRaw: string) {
  if (!targetTitleRaw || targetTitleRaw.startsWith("#")) return false;
  if (targetTitleRaw.includes("[[") || targetTitleRaw.includes("]]")) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(targetTitleRaw)) return false;
  if (/^mailto:/i.test(targetTitleRaw)) return false;
  if (/\[[^\]]+]\(\s*(?:[a-z][a-z0-9+.-]*:\/\/|mailto:)[^)]+\)/i.test(targetTitleRaw)) {
    return false;
  }

  return true;
}
