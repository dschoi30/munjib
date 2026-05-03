import { slugifyTitle } from "@/lib/text/slug";

export type WikiLinkPreviewCandidate = {
  id: string;
  title: string;
};

export function buildWikiLinkPreviewCandidateMap(candidates: WikiLinkPreviewCandidate[]) {
  return new Map(candidates.map((candidate) => [slugifyTitle(candidate.title), candidate]));
}

export function renderPreviewMarkdownWithWikiLinks(
  markdown: string,
  candidateBySlug: Map<string, WikiLinkPreviewCandidate>,
) {
  let openFence: MarkdownFence | null = null;

  return markdown
    .split("\n")
    .map((line) => {
      const fence = getMarkdownFence(line);
      if (fence && (!openFence || isClosingFence(openFence, fence, line))) {
        openFence = openFence ? null : fence;
        return line;
      }

      return openFence ? line : transformPreviewLine(line, candidateBySlug);
    })
    .join("\n");
}

type MarkdownFence = {
  marker: "`" | "~";
  width: number;
};

function getMarkdownFence(line: string): MarkdownFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match?.[1]) return null;
  const markerRun = match[1];
  return {
    marker: markerRun[0] as "`" | "~",
    width: markerRun.length,
  };
}

function isClosingFence(openFence: MarkdownFence, fence: MarkdownFence, line: string) {
  if (fence.marker !== openFence.marker || fence.width < openFence.width) return false;
  const closingFence = fence.marker === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}\\${closingFence}{${openFence.width},}\\s*$`).test(line);
}

function transformPreviewLine(
  line: string,
  candidateBySlug: Map<string, WikiLinkPreviewCandidate>,
) {
  const segments = line.split(/(`+)/);
  let openingTicks: string | null = null;

  return segments
    .map((segment) => {
      if (/^`+$/.test(segment)) {
        if (!openingTicks) {
          openingTicks = segment;
          return segment;
        }
        if (segment === openingTicks) {
          openingTicks = null;
          return segment;
        }
        return segment;
      }

      return openingTicks ? segment : transformWikiLinks(segment, candidateBySlug);
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
