import { slugifyTitle } from "@/lib/text/slug";

export type WikiLinkPreviewCandidate = {
  id: string;
  title: string;
};

export function renderPreviewMarkdownWithWikiLinks(
  markdown: string,
  candidates: WikiLinkPreviewCandidate[],
) {
  const candidateBySlug = new Map(
    candidates.map((candidate) => [slugifyTitle(candidate.title), candidate]),
  );
  let inFencedCode = false;

  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFencedCode = !inFencedCode;
        return line;
      }

      return inFencedCode ? line : transformPreviewLine(line, candidateBySlug);
    })
    .join("\n");
}

function transformPreviewLine(
  line: string,
  candidateBySlug: Map<string, WikiLinkPreviewCandidate>,
) {
  const segments = line.split(/(`+)/);
  let inCode = false;

  return segments
    .map((segment) => {
      if (/^`+$/.test(segment)) {
        if (segment.length % 2 === 1) inCode = !inCode;
        return segment;
      }

      return inCode ? segment : transformWikiLinks(segment, candidateBySlug);
    })
    .join("");
}

function transformWikiLinks(
  text: string,
  candidateBySlug: Map<string, WikiLinkPreviewCandidate>,
) {
  return text.replace(/(!?)\[\[([^\]]+)\]\]/g, (match, embedPrefix: string, rawContent: string) => {
    if (embedPrefix) return match;

    const raw = rawContent.trim();
    if (!raw || raw.startsWith("#")) return match;

    const [targetPart, aliasPart] = raw.split("|");
    const targetTitle = targetPart?.trim() ?? "";
    if (!targetTitle || targetTitle.startsWith("#")) return match;

    const label = aliasPart?.trim() || targetTitle;
    const candidate = candidateBySlug.get(slugifyTitle(targetTitle));
    if (!candidate) return escapeMarkdownText(label);

    return `[${escapeMarkdownLinkLabel(label)}](?document=${encodeURIComponent(candidate.id)})`;
  });
}

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function escapeMarkdownLinkLabel(value: string) {
  return value.replace(/([\\[\]])/g, "\\$1");
}
