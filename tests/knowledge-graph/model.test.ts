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

    expect(graph.nodes.map((node) => node.id)).toEqual([
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
    expect(graph.nodes.find((node) => node.id === "document:doc-1")).toMatchObject({
      id: "document:doc-1",
      kind: "document",
      label: "Welcome",
      documentId: "doc-1",
      title: "Welcome",
      path: "/welcome",
    });
  });

  it("builds typed graph links from resolved links, broken links, tags, and scalar properties", () => {
    const graph = buildKnowledgeGraph(fixture);

    expect(graph.links).toEqual([
      {
        id: "property:doc-1:status:active",
        source: "document:doc-1",
        target: "property:status:active",
        kind: "property",
      },
      {
        id: "property:doc-2:score:5",
        source: "document:doc-2",
        target: "property:score:5",
        kind: "property",
      },
      {
        id: "tag:doc-1:design",
        source: "document:doc-1",
        target: "tag:design",
        kind: "tag",
      },
      {
        id: "wiki:link-1",
        source: "document:doc-1",
        target: "document:doc-2",
        kind: "wiki",
      },
      {
        id: "wiki:link-2",
        source: "document:doc-1",
        target: "wiki:broken:missing-runbook",
        kind: "wiki",
      },
    ]);
  });

  it("does not merge distinct non-ASCII wiki and property labels", () => {
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
      properties: [
        { documentId: "doc-1", key: "상태", valueJson: "진행", valueType: "string" },
        { documentId: "doc-1", key: "상태", valueJson: "완료", valueType: "string" },
      ],
    });

    const wikiNodes = graph.nodes.filter((node) => node.kind === "wiki");
    const propertyNodes = graph.nodes.filter((node) => node.kind === "property");

    expect(wikiNodes).toHaveLength(2);
    expect(wikiNodes.map((node) => node.id)).toEqual([
      "wiki:broken:raw:%EA%B0%9C%EB%B0%9C%20%EB%AC%B8%EC%84%9C",
      "wiki:broken:raw:%EC%9A%B4%EC%98%81%20%EB%AC%B8%EC%84%9C",
    ]);
    expect(wikiNodes.map((node) => node.label)).toEqual(["개발 문서", "운영 문서"]);

    expect(propertyNodes).toHaveLength(2);
    expect(propertyNodes.map((node) => node.id)).toEqual([
      "property:raw:%EC%83%81%ED%83%9C:raw:%EC%99%84%EB%A3%8C",
      "property:raw:%EC%83%81%ED%83%9C:raw:%EC%A7%84%ED%96%89",
    ]);
    expect(propertyNodes.map((node) => node.label)).toEqual(["상태: 완료", "상태: 진행"]);
  });

  it("returns deterministic graph order regardless of input order", () => {
    const graph = buildKnowledgeGraph({
      ...fixture,
      documents: [...fixture.documents].reverse(),
      links: [...fixture.links].reverse(),
      properties: [...fixture.properties].reverse(),
    });

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "document:doc-1",
      "document:doc-2",
      "property:score:5",
      "property:status:active",
      "tag:design",
      "wiki:broken:missing-runbook",
    ]);
    expect(graph.links.map((link) => link.id)).toEqual([
      "property:doc-1:status:active",
      "property:doc-2:score:5",
      "tag:doc-1:design",
      "wiki:link-1",
      "wiki:link-2",
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
