import { describe, expect, it } from "vitest";
import {
  RETRIEVAL_SCORE_WEIGHTS,
  buildRetrievalScopes,
  rerankRetrievedChunks,
} from "@/lib/rag/retriever";
// @ts-expect-error ReadableDocument is an internal retriever input type.
import type { ReadableDocument } from "@/lib/rag/retriever";
// @ts-expect-error PersistedLink is an internal retriever input type.
import type { PersistedLink } from "@/lib/rag/retriever";
// @ts-expect-error RankedRerankChunk is an internal retriever return helper type.
import type { RankedRerankChunk } from "@/lib/rag/retriever";

void (undefined as unknown as ReadableDocument | PersistedLink | RankedRerankChunk);

const documents = [
  { id: "current", title: "Current", path: "/current", contentMarkdown: "See [[Linked]] #ops" },
  { id: "linked", title: "Linked", path: "/linked", contentMarkdown: "" },
  { id: "backlink", title: "Backlink", path: "/backlink", contentMarkdown: "[[Current]]" },
  { id: "tagged", title: "Tagged", path: "/tagged", contentMarkdown: "#ops" },
  { id: "fallback", title: "Fallback", path: "/fallback", contentMarkdown: "" },
];

describe("RAG retriever", () => {
  it("builds current, wiki, backlink, tag, and fallback scopes", () => {
    const scopes = buildRetrievalScopes({
      selectedDocumentId: "current",
      readableDocuments: documents,
      persistedLinks: [
        {
          sourceDocumentId: "backlink",
          targetDocumentId: "current",
          targetTitleRaw: "Current",
          isBroken: false,
          isAmbiguous: false,
        },
      ],
    });

    expect(scopes.currentDocumentIds).toEqual(["current"]);
    expect(scopes.linkedDocumentIds).toContain("linked");
    expect(scopes.backlinkDocumentIds).toContain("backlink");
    expect(scopes.sameTagDocumentIds).toContain("tagged");
    expect(scopes.fallbackDocumentIds).toContain("fallback");
  });

  it("reranks with current document and graph boosts", () => {
    const ranked = rerankRetrievedChunks({
      chunks: [
        { id: "fallback", documentId: "fallback", distance: 0.1, content: "alpha" },
        { id: "current", documentId: "current", distance: 0.3, content: "alpha" },
        { id: "linked", documentId: "linked", distance: 0.25, content: "alpha" },
      ],
      scopes: {
        currentDocumentIds: ["current"],
        linkedDocumentIds: ["linked"],
        backlinkDocumentIds: [],
        sameTagDocumentIds: [],
        fallbackDocumentIds: ["fallback"],
      },
      query: "alpha",
      limit: 2,
    });

    expect(ranked.map((chunk) => chunk.id)).toEqual(["current", "linked"]);
  });

  it("exposes explicit scoring weights for tuning", () => {
    expect(RETRIEVAL_SCORE_WEIGHTS).toEqual({
      currentDocument: 0.5,
      linkedDocument: 0.3,
      backlinkDocument: 0.25,
      sameTagDocument: 0.15,
      keywordPerTerm: 0.05,
      keywordMaximum: 0.2,
    });
  });

  it("falls back to all readable documents when the selected document is not readable", () => {
    const scopes = buildRetrievalScopes({
      selectedDocumentId: "unreadable",
      readableDocuments: documents,
      persistedLinks: [],
    });

    expect(scopes).toEqual({
      currentDocumentIds: [],
      linkedDocumentIds: [],
      backlinkDocumentIds: [],
      sameTagDocumentIds: [],
      fallbackDocumentIds: documents.map((document) => document.id),
    });
  });

  it("ignores broken and ambiguous persisted links", () => {
    const scopes = buildRetrievalScopes({
      selectedDocumentId: "current",
      readableDocuments: documents,
      persistedLinks: [
        {
          sourceDocumentId: "current",
          targetDocumentId: "fallback",
          targetTitleRaw: "Fallback",
          isBroken: true,
          isAmbiguous: false,
        },
        {
          sourceDocumentId: "backlink",
          targetDocumentId: "current",
          targetTitleRaw: "Current",
          isBroken: false,
          isAmbiguous: true,
        },
      ],
    });

    expect(scopes.linkedDocumentIds).not.toContain("fallback");
    expect(scopes.backlinkDocumentIds).not.toContain("backlink");
  });

  it("resolves path-qualified wiki links with the shared resolver", () => {
    const scopes = buildRetrievalScopes({
      selectedDocumentId: "current",
      readableDocuments: [
        {
          id: "current",
          title: "Current",
          path: "/current",
          contentMarkdown: "See [[Operations/Incident Runbook]]",
        },
        {
          id: "incident",
          title: "Incident Runbook",
          path: "/operations/incident-runbook",
          contentMarkdown: "",
        },
        {
          id: "other",
          title: "Incident Runbook",
          path: "/engineering/incident-runbook",
          contentMarkdown: "",
        },
      ],
      persistedLinks: [],
    });

    expect(scopes.linkedDocumentIds).toEqual(["incident"]);
  });

  it("does not duplicate document ids across lower-priority scopes", () => {
    const scopes = buildRetrievalScopes({
      selectedDocumentId: "current",
      readableDocuments: [
        { id: "current", title: "Current", path: "/current", contentMarkdown: "[[Shared]] #ops" },
        { id: "shared", title: "Shared", path: "/shared", contentMarkdown: "[[Current]] #ops" },
        { id: "fallback", title: "Fallback", path: "/fallback", contentMarkdown: "" },
      ],
      persistedLinks: [
        {
          sourceDocumentId: "shared",
          targetDocumentId: "current",
          targetTitleRaw: "Current",
          isBroken: false,
          isAmbiguous: false,
        },
      ],
    });

    expect(scopes.linkedDocumentIds).toEqual(["shared"]);
    expect(scopes.backlinkDocumentIds).toEqual([]);
    expect(scopes.sameTagDocumentIds).toEqual([]);
    expect(scopes.fallbackDocumentIds).toEqual(["fallback"]);
  });

  it("bounds keyword boost by keywordMaximum", () => {
    const ranked = rerankRetrievedChunks({
      chunks: [
        { id: "closer", documentId: "fallback", distance: 0.3, content: "one" },
        {
          id: "keyword-rich",
          documentId: "fallback",
          distance: 0.5,
          content: "one two three four five six",
        },
      ],
      scopes: {
        currentDocumentIds: [],
        linkedDocumentIds: [],
        backlinkDocumentIds: [],
        sameTagDocumentIds: [],
        fallbackDocumentIds: ["fallback"],
      },
      query: "one two three four five six",
      limit: 2,
    });

    expect(ranked.map((chunk) => chunk.id)).toEqual(["closer", "keyword-rich"]);
  });
});
