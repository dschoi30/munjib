// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeGraphView } from "@/components/knowledge-graph-view";
import type { KnowledgeGraphData } from "@/lib/knowledge-graph/model";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const forceGraphMock = vi.hoisted(() => {
  const state = { latestProps: null as Record<string, unknown> | null };
  const Component = (props: Record<string, unknown>) => {
    state.latestProps = props;
    const React = require("react");
    return React.createElement("div", { "data-testid": "force-graph" });
  };

  return { Component, state };
});

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => forceGraphMock.Component,
}));

vi.mock("react-force-graph-2d", () => ({
  __esModule: true,
  default: forceGraphMock.Component,
}));

function createGraph(): KnowledgeGraphData {
  return {
    nodes: [
      {
        id: "document:doc-1",
        kind: "document",
        label: "Welcome",
        documentId: "doc-1",
        title: "Welcome",
        path: "/welcome",
      },
      {
        id: "tag:design",
        kind: "tag",
        label: "#Design",
        name: "Design",
        normalizedName: "design",
      },
    ],
    links: [
      {
        id: "tag:doc-1:design",
        source: "document:doc-1",
        target: "tag:design",
        kind: "tag",
      },
    ],
  };
}

function renderGraph(graph = createGraph()) {
  return render(
    <KnowledgeGraphView
      workspaceSlug="company-handbook"
      graph={graph}
      selectedDocumentId="doc-1"
    />,
  );
}

beforeEach(() => {
  router.push.mockReset();
  forceGraphMock.state.latestProps = null;

  Object.defineProperties(HTMLElement.prototype, {
    clientWidth: { configurable: true, get: () => 720 },
    clientHeight: { configurable: true, get: () => 480 },
  });
});

afterEach(() => {
  cleanup();
});

describe("KnowledgeGraphView", () => {
  it("renders force graph and toggles the filter panel labels", () => {
    renderGraph();

    expect(screen.getByTestId("force-graph")).toBeTruthy();
    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.getByLabelText("Wiki links")).toBeTruthy();
    expect(screen.getByLabelText("Tags")).toBeTruthy();
    expect(screen.getByLabelText("Properties")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));

    expect(screen.queryByLabelText("Wiki links")).toBeNull();
    expect(screen.queryByLabelText("Tags")).toBeNull();
    expect(screen.queryByLabelText("Properties")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));

    expect(screen.getByLabelText("Wiki links")).toBeTruthy();
    expect(screen.getByLabelText("Tags")).toBeTruthy();
    expect(screen.getByLabelText("Properties")).toBeTruthy();
  });

  it("filters tag links and leaves only document nodes when Tags is unchecked", () => {
    const graph = createGraph();
    renderGraph();

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[0]],
      links: [],
    });
  });

  it("passes explicit force graph dimensions from the container", async () => {
    renderGraph();

    await waitFor(() => {
      expect(forceGraphMock.state.latestProps).toMatchObject({
        width: 720,
        height: 480,
      });
    });
  });

  it("keeps app graph data immutable when force graph mutates rendered links", () => {
    const graph = createGraph();
    renderGraph(graph);

    const renderedGraph = forceGraphMock.state.latestProps?.graphData as {
      nodes: Array<KnowledgeGraphData["nodes"][number]>;
      links: Array<KnowledgeGraphData["links"][number]>;
    };
    renderedGraph.links[0].source = graph.nodes[0] as never;
    renderedGraph.links[0].target = graph.nodes[1] as never;

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[0]],
      links: [],
    });
    expect(graph.links[0].source).toBe("document:doc-1");
    expect(graph.links[0].target).toBe("tag:design");
  });

  it("preserves renderer object identity across filter toggles", () => {
    const graph = createGraph();
    renderGraph(graph);

    const initialRenderedGraph = forceGraphMock.state.latestProps?.graphData as {
      nodes: Array<KnowledgeGraphData["nodes"][number]>;
      links: Array<KnowledgeGraphData["links"][number]>;
    };
    const initialDocumentNode = initialRenderedGraph.nodes[0];
    const initialLink = initialRenderedGraph.links[0];

    initialLink.source = initialRenderedGraph.nodes[0] as never;
    initialLink.target = initialRenderedGraph.nodes[1] as never;

    fireEvent.click(screen.getByLabelText("Tags"));
    fireEvent.click(screen.getByLabelText("Tags"));

    const restoredRenderedGraph = forceGraphMock.state.latestProps?.graphData as {
      nodes: Array<KnowledgeGraphData["nodes"][number]>;
      links: Array<KnowledgeGraphData["links"][number]>;
    };

    expect(restoredRenderedGraph.nodes[0]).toBe(initialDocumentNode);
    expect(restoredRenderedGraph.links[0]).toBe(initialLink);
    expect(restoredRenderedGraph.links[0].source).toBe(initialRenderedGraph.nodes[0]);
    expect(graph.links[0].source).toBe("document:doc-1");
    expect(graph.links[0].target).toBe("tag:design");
  });

  it("dims nodes and links outside the selected document neighborhood", () => {
    const graph: KnowledgeGraphData = {
      nodes: [
        ...createGraph().nodes,
        {
          id: "document:doc-2",
          kind: "document",
          label: "Unrelated",
          documentId: "doc-2",
          title: "Unrelated",
          path: "/unrelated",
        },
      ],
      links: createGraph().links,
    };
    renderGraph(graph);

    const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
      | ((node: KnowledgeGraphData["nodes"][number]) => string)
      | undefined;
    const linkColor = forceGraphMock.state.latestProps?.linkColor as
      | ((link: KnowledgeGraphData["links"][number]) => string)
      | undefined;

    expect(nodeColor?.(graph.nodes[0])).toBe("#a78bfa");
    expect(nodeColor?.(graph.nodes[1])).toBe("#f59e0b");
    expect(nodeColor?.(graph.nodes[2])).toBe("#e5e7eb88");
    expect(linkColor?.(graph.links[0])).toBe("#f59e0b");
    expect(
      linkColor?.({
        id: "property:doc-2:status:active",
        source: "document:doc-2",
        target: "property:status:active",
        kind: "property",
      }),
    ).toBe("#38bdf844");
  });

  it("does not dim the graph when no document is selected", () => {
    const graph = createGraph();
    render(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={graph}
        selectedDocumentId={null}
      />,
    );

    const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
      | ((node: KnowledgeGraphData["nodes"][number]) => string)
      | undefined;
    const linkColor = forceGraphMock.state.latestProps?.linkColor as
      | ((link: KnowledgeGraphData["links"][number]) => string)
      | undefined;

    expect(nodeColor?.(graph.nodes[0])).toBe("#e5e7eb");
    expect(nodeColor?.(graph.nodes[1])).toBe("#f59e0b");
    expect(linkColor?.(graph.links[0])).toBe("#f59e0b");
  });

  it("routes document node clicks to the selected workspace document", () => {
    const graph = createGraph();
    renderGraph();

    const onNodeClick = forceGraphMock.state.latestProps?.onNodeClick as
      | ((node: (typeof graph.nodes)[number]) => void)
      | undefined;

    onNodeClick?.(graph.nodes[0]);

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
  });
});
