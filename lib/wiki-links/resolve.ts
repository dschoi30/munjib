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

/** Build once per readable document set; preserve the single-target resolver's precedence. */
export function createWikiLinkTargetResolver(targets: WikiLinkTargetCandidate[]) {
  const byPath = new Map<string, WikiLinkTargetCandidate>();
  const byPathTitle = new Map<string, WikiLinkTargetCandidate | null>();
  const byTitle = new Map<string, WikiLinkTargetCandidate | null>();
  const addMatch = (map: Map<string, WikiLinkTargetCandidate | null>, key: string, candidate: WikiLinkTargetCandidate) => {
    map.set(key, map.has(key) ? null : candidate);
  };
  for (const candidate of targets) {
    if (!byPath.has(candidate.path)) byPath.set(candidate.path, candidate);
    addMatch(byPathTitle, pathQualifiedCandidateToTitleLookupKey(candidate), candidate);
    addMatch(byTitle, wikiLinkTargetToLookupKey(candidate.title), candidate);
  }
  const result = (candidate: WikiLinkTargetCandidate | null | undefined): ResolvedWikiLinkTarget => ({
    targetDocumentId: candidate?.id ?? null,
    isBroken: candidate === undefined,
    isAmbiguous: candidate === null,
  });
  return (targetTitleRaw: string): ResolvedWikiLinkTarget => {
    if (targetTitleRaw.includes("/")) {
      const exact = byPath.get(pathQualifiedTargetToLookupDocumentPath(targetTitleRaw));
      if (exact) return result(exact);
      const pathTitle = byPathTitle.get(pathQualifiedTargetToTitleLookupKey(targetTitleRaw));
      if (pathTitle !== undefined) return result(pathTitle);
    }
    return result(byTitle.get(wikiLinkTargetToLookupKey(targetTitleRaw)));
  };
}
