export type ParsedWikiLink = {
  targetTitleRaw: string;
  alias: string | null;
};

export function parseWikiLinks(markdown: string): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = [];
  const seen = new Set<string>();
  const withoutEmbeds = markdown.replace(/!\[\[[^\]]+\]\]/g, "");

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
