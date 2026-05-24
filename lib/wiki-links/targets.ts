import { slugifyTitle } from "@/lib/text/slug";

export function wikiLinkTargetToLookupKey(targetTitleRaw: string) {
  return normalizeWikiLinkTargetForLookup(targetTitleRaw)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function pathQualifiedTargetToDocumentPath(targetTitleRaw: string) {
  const segments = targetTitleRaw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => slugifyTitle(segment))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

export function pathQualifiedTargetToLookupKey(targetTitleRaw: string) {
  return pathQualifiedTargetToLookupDocumentPath(targetTitleRaw).replace(/^\/+/, "");
}

export function pathQualifiedTargetToLookupDocumentPath(targetTitleRaw: string) {
  const segments = targetTitleRaw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => wikiLinkPathSegmentToStoredPathKey(segment))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

export function pathQualifiedTargetToTitleLookupKey(targetTitleRaw: string) {
  const segments = targetTitleRaw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment, index, allSegments) =>
      index === allSegments.length - 1
        ? wikiLinkTargetToLookupKey(segment)
        : wikiLinkPathSegmentToStoredPathKey(segment),
    )
    .filter(Boolean);
  return segments.join("/");
}

export function pathQualifiedCandidateToTitleLookupKey(candidate: { path: string; title: string }) {
  const parentPath = candidate.path.replace(/^\/+|\/+$/g, "").split("/").slice(0, -1).join("/");
  const titleKey = wikiLinkTargetToLookupKey(candidate.title);
  return [parentPath, titleKey].filter(Boolean).join("/");
}

export function pathQualifiedTargetToCreateInput(targetTitleRaw: string) {
  const segments = targetTitleRaw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) return null;

  return {
    folderPath: `/${segments.slice(0, -1).map((segment) => slugifyTitle(segment)).join("/")}`,
    title: segments[segments.length - 1] ?? "",
  };
}

function normalizeWikiLinkTargetForLookup(targetTitleRaw: string) {
  return targetTitleRaw
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/_+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function wikiLinkPathSegmentToStoredPathKey(segment: string) {
  return slugifyTitle(segment.replace(/_+/g, " "));
}
