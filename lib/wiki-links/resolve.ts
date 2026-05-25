import {
  pathQualifiedCandidateToTitleLookupKey,
  pathQualifiedTargetToLookupDocumentPath,
  pathQualifiedTargetToTitleLookupKey,
  wikiLinkTargetToLookupKey,
} from "@/lib/wiki-links/targets";

export type WikiLinkTargetCandidate = {
  id: string;
  path: string;
  title: string;
};

export type ResolvedWikiLinkTarget = {
  isAmbiguous: boolean;
  isBroken: boolean;
  targetDocumentId: string | null;
};

export function resolveWikiLinkTarget(
  targets: WikiLinkTargetCandidate[],
  targetTitleRaw: string,
): ResolvedWikiLinkTarget {
  if (targetTitleRaw.includes("/")) {
    const targetPath = pathQualifiedTargetToLookupDocumentPath(targetTitleRaw);
    const target = targets.find((candidate) => candidate.path === targetPath);
    if (target) {
      return { targetDocumentId: target.id, isBroken: false, isAmbiguous: false };
    }

    const targetLookupKey = pathQualifiedTargetToTitleLookupKey(targetTitleRaw);
    const pathTitleMatches = targets.filter(
      (candidate) => pathQualifiedCandidateToTitleLookupKey(candidate) === targetLookupKey,
    );
    if (pathTitleMatches.length === 1) {
      return {
        targetDocumentId: pathTitleMatches[0]?.id ?? null,
        isBroken: false,
        isAmbiguous: false,
      };
    }
    if (pathTitleMatches.length > 1) {
      return { targetDocumentId: null, isBroken: false, isAmbiguous: true };
    }

  }

  const targetSlug = wikiLinkTargetToLookupKey(targetTitleRaw);
  const matches = targets.filter(
    (candidate) => wikiLinkTargetToLookupKey(candidate.title) === targetSlug,
  );
  if (matches.length === 1) {
    return { targetDocumentId: matches[0]?.id ?? null, isBroken: false, isAmbiguous: false };
  }
  if (matches.length > 1) {
    return { targetDocumentId: null, isBroken: false, isAmbiguous: true };
  }

  return { targetDocumentId: null, isBroken: true, isAmbiguous: false };
}
