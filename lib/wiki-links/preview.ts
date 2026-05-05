import { slugifyTitle } from "@/lib/text/slug";

export type WikiLinkPreviewCandidate = {
  id: string;
  slug: string;
  title: string;
  path: string;
};

export function buildWikiLinkPreviewCandidateMap(candidates: WikiLinkPreviewCandidate[]) {
  const candidateBySlug = new Map<string, WikiLinkPreviewCandidate | null>();

  for (const candidate of candidates) {
    setUniqueCandidate(candidateBySlug, candidate.slug, candidate);
    candidateBySlug.set(candidate.path.replace(/^\/+|\/+$/g, "").toLowerCase(), candidate);

    const titleSlug = slugifyTitle(candidate.title);
    setUniqueCandidate(candidateBySlug, titleSlug, candidate);
  }

  return candidateBySlug;
}

function setUniqueCandidate(
  candidateBySlug: Map<string, WikiLinkPreviewCandidate | null>,
  key: string,
  candidate: WikiLinkPreviewCandidate,
) {
  const existing = candidateBySlug.get(key);
  if (existing === undefined) {
    candidateBySlug.set(key, candidate);
  } else if (existing?.id !== candidate.id) {
    candidateBySlug.set(key, null);
  }
}

export function renderPreviewMarkdownWithWikiLinks(
  markdown: string,
  candidateBySlug: Map<string, WikiLinkPreviewCandidate | null>,
) {
  let openFence: MarkdownFence | null = null;
  let openingTicks: string | null = null;

  return markdown
    .split("\n")
    .map((line) => {
      const fence = getMarkdownFence(line);
      if (fence && (!openFence || isClosingFence(openFence, fence, line))) {
        openFence = openFence ? null : fence;
        return line;
      }

      if (openFence) return line;
      if (isIndentedCodeLine(line)) return line;

      const result = transformPreviewLine(line, candidateBySlug, openingTicks);
      openingTicks = result.openingTicks;
      return result.line;
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

function isIndentedCodeLine(line: string) {
  return /^( {4,}|\t)/.test(line);
}

function transformPreviewLine(
  line: string,
  candidateBySlug: Map<string, WikiLinkPreviewCandidate | null>,
  currentOpeningTicks: string | null,
) {
  const segments = line.split(/(`+)/);
  let openingTicks = currentOpeningTicks;

  const transformedLine = segments
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

  return { line: transformedLine, openingTicks };
}

function transformWikiLinks(
  text: string,
  candidateBySlug: Map<string, WikiLinkPreviewCandidate | null>,
) {
  return text.replace(/(!?)\[\[([^\]]+)\]\]/g, (match, embedPrefix: string, rawContent: string, offset: number) => {
    if (text[offset - 1] === "\\") return match;
    if (embedPrefix) return match;

    const raw = rawContent.trim();
    if (!raw || raw.startsWith("#")) return match;

    const [targetPart, aliasPart] = raw.split("|");
    const targetTitle = targetPart?.trim() ?? "";
    if (!targetTitle || targetTitle.startsWith("#")) return match;

    const label = aliasPart?.trim() || targetTitle;
    const candidate = candidateBySlug.get(candidateLookupKey(targetTitle));
    if (!candidate) return escapeMarkdownText(label);

    return `[${escapeMarkdownLinkLabel(label)}](?document=${encodeURIComponent(candidate.id)})`;
  });
}

function candidateLookupKey(targetTitle: string) {
  return targetTitle.includes("/")
    ? targetTitle
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .map((segment) => slugifyTitle(segment))
        .filter(Boolean)
        .join("/")
    : slugifyTitle(targetTitle);
}

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function escapeMarkdownLinkLabel(value: string) {
  return value.replace(/([\\[\]])/g, "\\$1");
}
