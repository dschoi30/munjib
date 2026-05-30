import { normalizeTag, parseDocumentMetadata } from "@/lib/document-metadata/parser";
import { parseWikiLinks } from "@/lib/wiki-links/parser";
import { resolveWikiLinkTarget } from "@/lib/wiki-links/resolve";

type ReadableDocument = {
  id: string;
  title: string;
  path: string;
  contentMarkdown: string;
};

type PersistedLink = {
  sourceDocumentId: string;
  targetDocumentId: string | null;
  targetTitleRaw: string;
  isBroken: boolean;
  isAmbiguous: boolean;
};

export type RetrievalScopes = {
  currentDocumentIds: string[];
  linkedDocumentIds: string[];
  backlinkDocumentIds: string[];
  sameTagDocumentIds: string[];
  fallbackDocumentIds: string[];
};

export type RerankChunk = {
  id: string;
  documentId: string;
  distance: number;
  content: string;
};

type RankedRerankChunk<TChunk extends RerankChunk = RerankChunk> = TChunk & {
  score: number;
};

type BuildRetrievalScopesInput = {
  selectedDocumentId: string;
  readableDocuments: ReadableDocument[];
  persistedLinks: PersistedLink[];
};

type RerankRetrievedChunksInput<TChunk extends RerankChunk = RerankChunk> = {
  chunks: TChunk[];
  scopes: RetrievalScopes;
  query: string;
  limit: number;
};

export const RETRIEVAL_SCORE_WEIGHTS = {
  currentDocument: 0.5,
  linkedDocument: 0.3,
  backlinkDocument: 0.25,
  sameTagDocument: 0.15,
  keywordPerTerm: 0.05,
  keywordMaximum: 0.2,
} as const;

export function buildRetrievalScopes(input: BuildRetrievalScopesInput): RetrievalScopes {
  const readableById = new Map(input.readableDocuments.map((document) => [document.id, document]));
  const selectedDocument = readableById.get(input.selectedDocumentId);

  if (!selectedDocument) {
    return {
      currentDocumentIds: [],
      linkedDocumentIds: [],
      backlinkDocumentIds: [],
      sameTagDocumentIds: [],
      fallbackDocumentIds: input.readableDocuments.map((document) => document.id),
    };
  }

  const currentDocumentIds: string[] = [];
  const linkedDocumentIds: string[] = [];
  const backlinkDocumentIds: string[] = [];
  const sameTagDocumentIds: string[] = [];
  const fallbackDocumentIds: string[] = [];
  const assignedDocumentIds = new Set<string>();

  addScopedDocument(currentDocumentIds, selectedDocument.id, readableById, assignedDocumentIds);

  const linkTargets = input.readableDocuments.map((document) => ({
    id: document.id,
    path: document.path,
    title: document.title,
  }));

  for (const link of parseWikiLinks(selectedDocument.contentMarkdown)) {
    const resolved = resolveWikiLinkTarget(linkTargets, link.targetTitleRaw);
    if (resolved.isBroken || resolved.isAmbiguous) continue;

    addScopedDocument(
      linkedDocumentIds,
      resolved.targetDocumentId,
      readableById,
      assignedDocumentIds,
    );
  }

  for (const link of input.persistedLinks) {
    if (link.sourceDocumentId !== selectedDocument.id) continue;
    if (link.isBroken || link.isAmbiguous) continue;

    addScopedDocument(linkedDocumentIds, link.targetDocumentId, readableById, assignedDocumentIds);
  }

  for (const link of input.persistedLinks) {
    if (link.targetDocumentId !== selectedDocument.id) continue;
    if (link.isBroken || link.isAmbiguous) continue;

    addScopedDocument(backlinkDocumentIds, link.sourceDocumentId, readableById, assignedDocumentIds);
  }

  const selectedTags = normalizedDocumentTagSet(selectedDocument);
  if (selectedTags.size > 0) {
    for (const document of input.readableDocuments) {
      if (document.id === selectedDocument.id) continue;

      const documentTags = normalizedDocumentTagSet(document);
      if (!setsIntersect(selectedTags, documentTags)) continue;

      addScopedDocument(sameTagDocumentIds, document.id, readableById, assignedDocumentIds);
    }
  }

  for (const document of input.readableDocuments) {
    addScopedDocument(fallbackDocumentIds, document.id, readableById, assignedDocumentIds);
  }

  return {
    currentDocumentIds,
    linkedDocumentIds,
    backlinkDocumentIds,
    sameTagDocumentIds,
    fallbackDocumentIds,
  };
}

// Score = (1 - cosine distance) + scope boost + bounded keyword overlap boost.
export function rerankRetrievedChunks<TChunk extends RerankChunk>(
  input: RerankRetrievedChunksInput<TChunk>,
): RankedRerankChunk<TChunk>[] {
  if (input.limit <= 0) return [];

  const terms = uniqueLowercaseTerms(input.query);

  return input.chunks
    .map((chunk, index) => ({
      chunk,
      index,
      score:
        1 -
        chunk.distance +
        scopeBoost(chunk.documentId, input.scopes) +
        keywordBoost(chunk.content, terms),
    }))
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference !== 0) return scoreDifference;

      const distanceDifference = left.chunk.distance - right.chunk.distance;
      if (distanceDifference !== 0) return distanceDifference;

      const idDifference = left.chunk.id.localeCompare(right.chunk.id);
      if (idDifference !== 0) return idDifference;

      return left.index - right.index;
    })
    .slice(0, input.limit)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

function addScopedDocument(
  scope: string[],
  documentId: string | null,
  readableById: Map<string, ReadableDocument>,
  assignedDocumentIds: Set<string>,
) {
  if (!documentId || !readableById.has(documentId) || assignedDocumentIds.has(documentId)) return;

  scope.push(documentId);
  assignedDocumentIds.add(documentId);
}

function normalizedDocumentTagSet(document: ReadableDocument) {
  return new Set(
    parseDocumentMetadata(document.contentMarkdown)
      .tags.map(normalizeTag)
      .filter(Boolean),
  );
}

function setsIntersect(left: Set<string>, right: Set<string>) {
  for (const value of left) {
    if (right.has(value)) return true;
  }

  return false;
}

function scopeBoost(documentId: string, scopes: RetrievalScopes) {
  if (scopes.currentDocumentIds.includes(documentId)) {
    return RETRIEVAL_SCORE_WEIGHTS.currentDocument;
  }
  if (scopes.linkedDocumentIds.includes(documentId)) {
    return RETRIEVAL_SCORE_WEIGHTS.linkedDocument;
  }
  if (scopes.backlinkDocumentIds.includes(documentId)) {
    return RETRIEVAL_SCORE_WEIGHTS.backlinkDocument;
  }
  if (scopes.sameTagDocumentIds.includes(documentId)) {
    return RETRIEVAL_SCORE_WEIGHTS.sameTagDocument;
  }

  return 0;
}

function keywordBoost(content: string, terms: Set<string>) {
  if (terms.size === 0) return 0;

  const contentLower = content.toLowerCase();
  let matches = 0;

  for (const term of terms) {
    if (contentLower.includes(term)) matches += 1;
  }

  return Math.min(
    matches * RETRIEVAL_SCORE_WEIGHTS.keywordPerTerm,
    RETRIEVAL_SCORE_WEIGHTS.keywordMaximum,
  );
}

function uniqueLowercaseTerms(query: string) {
  return new Set(query.toLowerCase().split(/\s+/).filter(Boolean));
}
