import { describe, expect, it } from "vitest";
import {
  buildKnowledgeGraph,
  filterKnowledgeGraph,
  getKnowledgeGraphFocus,
  type KnowledgeGraphInput,
} from "@/lib/knowledge-graph/model";

const fixture: KnowledgeGraphInput = {
  documents: [
    { id: "doc-1", title: "Welcome", path: "/welcome" },
    { id: "doc-2", title: "Engineering Runbook", path: "/engineering-runbook" },
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
    {
      id: "link-2",
      sourceDocumentId: "doc-1",
      targetDocumentId: null,
      targetTitleRaw: "Missing Runbook",
      isBroken: true,
      isAmbiguous: false,
    },
  ],
  tags: [{ documentId: "doc-1", tag: { name: "Design", normalizedName: "design" } }],
  properties: [
    { documentId: "doc-1", key: "status", valueJson: "active", valueType: "string" },
    { documentId: "doc-1", key: "tags", valueJson: ["Design"], valueType: "array" },
    { documentId: "doc-1", key: "links", valueJson: ["Engineering Runbook"], valueType: "array" },
    { documentId: "doc-2", key: "score", valueJson: 5, valueType: "number" },
  ],
};

describe("knowledge graph model", () => {
  it("builds typed graph nodes from readable documents and supported metadata", () => {
    const graph = buildKnowledgeGraph(fixture);

    expect(graph.nodes.map((node) => node.id).sort()).toEqual([
      "document:doc-1",
      "document:doc-2",
      "property:score:5",
      "property:status:active",
      "tag:design",
      "wiki:broken:missing-runbook",
    ]);
    expect(graph.nodes.every((node) => typeof node.label === "string")).toBe(true);
    expect(Object.fromEntries(graph.nodes.map((node) => [node.id, node.label]))).toMatchObject({
      "document:doc-1": "Welcome",
      "property:status:active": "status: active",
      "tag:design": "#Design",
      "wiki:broken:missing-runbook": "Missing Runbook",
    });
  });

  it("builds typed graph links from resolved links, broken links, tags, and scalar properties", () => {
    const graph = buildKnowledgeGraph(fixture);

    expect(
      graph.links
        .map((link) => ({
          source: link.source,
          target: link.target,
          kind: link.kind,
        }))
        .sort((a, b) => `${a.source}:${a.target}:${a.kind}`.localeCompare(`${b.source}:${b.target}:${b.kind}`)),
    ).toEqual([
      {
        source: "document:doc-1",
        target: "document:doc-2",
        kind: "wiki",
      },
      {
        source: "document:doc-1",
        target: "property:status:active",
        kind: "property",
      },
      {
        source: "document:doc-1",
        target: "tag:design",
        kind: "tag",
      },
      {
        source: "document:doc-1",
        target: "wiki:broken:missing-runbook",
        kind: "wiki",
      },
      {
        source: "document:doc-2",
        target: "property:score:5",
        kind: "property",
      },
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

  it("filters visible links and keeps documents plus connected non-document nodes", () => {
    const graph = buildKnowledgeGraph(fixture);
    const filtered = filterKnowledgeGraph(graph, { wiki: false, tag: true, property: false });

    expect(filtered.links).toEqual([
      {
        id: "tag:doc-1:design",
        source: "document:doc-1",
        target: "tag:design",
        kind: "tag",
      },
    ]);
    expect(filtered.nodes.map((node) => node.id).sort()).toEqual([
      "document:doc-1",
      "document:doc-2",
      "tag:design",
    ]);
  });
});
