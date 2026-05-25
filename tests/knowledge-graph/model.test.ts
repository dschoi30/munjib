import { describe, expect, it } from "vitest";
import {
  buildKnowledgeGraph,
  filterKnowledgeGraph,
  getKnowledgeGraphFocus,
  type KnowledgeGraphInput,
} from "@/lib/knowledge-graph/model";

const fixture: KnowledgeGraphInput = {
  documents: [
    {
      id: "doc-1",
      title: "Welcome",
      path: "/welcome",
      contentMarkdown: "See [[Engineering Runbook]] and [[Missing Runbook]].",
    },
    {
      id: "doc-2",
      title: "Engineering Runbook",
      path: "/engineering-runbook",
      contentMarkdown: "",
    },
    { id: "doc-3", title: "Orphan", path: "/orphan", contentMarkdown: "" },
  ],
  links: [
    {
      id: "link-1",
      sourceDocumentId: "doc-1",
      targetDocumentId: "doc-2",
      targetTitleRaw: "Engineering Runbook",
      isBroken: false,
      isAmbiguous: false,
    },
  ],
  tags: [{ documentId: "doc-1", tag: { name: "Design", normalizedName: "design" } }],
};

describe("knowledge graph model", () => {
  it("builds typed graph nodes from readable documents and supported metadata", () => {
    const graph = buildKnowledgeGraph(fixture);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "document:doc-1",
      "document:doc-2",
      "document:doc-3",
      "tag:design",
      "wiki:broken:missing-runbook",
    ]);
    expect(graph.nodes.every((node) => typeof node.label === "string")).toBe(true);
    expect(Object.fromEntries(graph.nodes.map((node) => [node.id, node.label]))).toMatchObject({
      "document:doc-1": "Welcome",
      "tag:design": "#Design",
      "wiki:broken:missing-runbook": "Missing Runbook",
    });
    expect(graph.nodes.find((node) => node.id === "document:doc-1")).toMatchObject({
      id: "document:doc-1",
      kind: "document",
      label: "Welcome",
      documentId: "doc-1",
      title: "Welcome",
      path: "/welcome",
    });
  });

  it("builds graph wiki links from full document markdown", () => {
    const graph = buildKnowledgeGraph(fixture);

    expect(graph.links).toEqual(
      expect.arrayContaining([
        {
          id: "wiki:link-1",
          source: "document:doc-1",
          target: "document:doc-2",
          kind: "wiki",
        },
        {
          id: "wiki:doc-1:wiki:broken:missing-runbook",
          source: "document:doc-1",
          target: "wiki:broken:missing-runbook",
          kind: "wiki",
        },
      ]),
    );
  });

  it("deduplicates persisted and scanned wiki links", () => {
    const graph = buildKnowledgeGraph(fixture);

    expect(graph.links.filter((link) => link.target === "document:doc-2")).toHaveLength(1);
  });

  it("does not rescan frontmatter wiki links as body links", () => {
    const graph = buildKnowledgeGraph({
      documents: [
        {
          id: "doc-1",
          title: "Source",
          path: "/source",
          contentMarkdown: `---
links:
  - "[[Runbook]]"
---

See [[Body Target]].`,
        },
        { id: "doc-2", title: "Runbook", path: "/runbook", contentMarkdown: "" },
        { id: "doc-3", title: "Body Target", path: "/body-target", contentMarkdown: "" },
      ],
      links: [
        {
          id: "link-1",
          sourceDocumentId: "doc-1",
          targetDocumentId: null,
          targetTitleRaw: "Runbook",
          isBroken: false,
          isAmbiguous: true,
        },
      ],
      tags: [],
    });

    expect(graph.links).toEqual([
      {
        id: "wiki:doc-1:document:doc-3",
        source: "document:doc-1",
        target: "document:doc-3",
        kind: "wiki",
      },
      {
        id: "wiki:link-1",
        source: "document:doc-1",
        target: "wiki:ambiguous:runbook",
        kind: "wiki",
      },
    ]);
    expect(graph.links.some((link) => link.target === "document:doc-2")).toBe(false);
  });

  it("builds typed graph links from resolved links, broken links, and tags", () => {
    const graph = buildKnowledgeGraph(fixture);

    expect(graph.links).toEqual([
      {
        id: "tag:doc-1:design",
        source: "document:doc-1",
        target: "tag:design",
        kind: "tag",
      },
      {
        id: "wiki:doc-1:wiki:broken:missing-runbook",
        source: "document:doc-1",
        target: "wiki:broken:missing-runbook",
        kind: "wiki",
      },
      {
        id: "wiki:link-1",
        source: "document:doc-1",
        target: "document:doc-2",
        kind: "wiki",
      },
    ]);
  });

  it("does not merge distinct non-ASCII wiki labels", () => {
    const graph = buildKnowledgeGraph({
      documents: [{ id: "doc-1", title: "Welcome", path: "/welcome" }],
      links: [
        {
          id: "link-1",
          sourceDocumentId: "doc-1",
          targetDocumentId: null,
          targetTitleRaw: "개발 문서",
          isBroken: true,
          isAmbiguous: false,
        },
        {
          id: "link-2",
          sourceDocumentId: "doc-1",
          targetDocumentId: null,
          targetTitleRaw: "운영 문서",
          isBroken: true,
          isAmbiguous: false,
        },
      ],
      tags: [],
    });

    const wikiNodes = graph.nodes.filter((node) => node.kind === "wiki");

    expect(wikiNodes).toHaveLength(2);
    expect(wikiNodes.map((node) => node.id)).toEqual([
      "wiki:broken:raw:%EA%B0%9C%EB%B0%9C%20%EB%AC%B8%EC%84%9C",
      "wiki:broken:raw:%EC%9A%B4%EC%98%81%20%EB%AC%B8%EC%84%9C",
    ]);
    expect(wikiNodes.map((node) => node.label)).toEqual(["개발 문서", "운영 문서"]);
  });

  it("does not emit property graph nodes or links", () => {
    const graph = buildKnowledgeGraph({
      ...fixture,
      properties: [
        { documentId: "doc-1", key: "status", valueJson: "active", valueType: "string" },
      ],
    } as KnowledgeGraphInput & {
      properties: Array<{ documentId: string; key: string; valueJson: unknown; valueType: string }>;
    });

    expect(graph.nodes.some((node) => node.id.startsWith("property:"))).toBe(false);
    expect(graph.links.some((link) => link.id.startsWith("property:"))).toBe(false);
  });

  it("returns deterministic graph order regardless of input order", () => {
    const graph = buildKnowledgeGraph({
      ...fixture,
      documents: [...fixture.documents].reverse(),
      links: [...fixture.links].reverse(),
    });

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "document:doc-1",
      "document:doc-2",
      "document:doc-3",
      "tag:design",
      "wiki:broken:missing-runbook",
    ]);
    expect(graph.links.map((link) => link.id)).toEqual([
      "tag:doc-1:design",
      "wiki:doc-1:wiki:broken:missing-runbook",
      "wiki:link-1",
    ]);
  });

  it("computes directly connected focus for a selected document", () => {
    const graph = buildKnowledgeGraph(fixture);
    const focus = getKnowledgeGraphFocus(graph, "doc-1");

    expect(focus.focusedNodeIds.has("document:doc-1")).toBe(true);
    expect(focus.focusedNodeIds.has("document:doc-2")).toBe(true);
    expect(focus.focusedNodeIds.has("tag:design")).toBe(true);
    expect(focus.focusedLinkIds.has("wiki:link-1")).toBe(true);
  });

  it("always keeps wiki links and filters tags and orphan document nodes", () => {
    const graph = buildKnowledgeGraph(fixture);
    const filtered = filterKnowledgeGraph(graph, { tag: false, orphans: false });

    expect(filtered.links.map((link) => link.kind)).toEqual(["wiki", "wiki"]);
    expect(filtered.nodes.map((node) => node.id).sort()).toEqual([
      "document:doc-1",
      "document:doc-2",
      "wiki:broken:missing-runbook",
    ]);
  });

  it("keeps orphan document nodes when the orphans filter is enabled", () => {
    const graph = buildKnowledgeGraph(fixture);
    const filtered = filterKnowledgeGraph(graph, { tag: false, orphans: true });

    expect(filtered.nodes.map((node) => node.id)).toContain("document:doc-3");
  });
});
