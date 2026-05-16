// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeGraphView } from "@/components/knowledge-graph-view";
import type { KnowledgeGraphData } from "@/lib/knowledge-graph/model";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const forceGraphMock = vi.hoisted(() => {
  const forceMethods = {
    charge: { strength: vi.fn() },
    link: { distance: vi.fn(), strength: vi.fn() },
  };
  const api = {
    d3Force: vi.fn((name: string, force?: unknown) => {
      if (force !== undefined) {
        return api;
      }

      return forceMethods[name as keyof typeof forceMethods];
    }),
    d3ReheatSimulation: vi.fn(),
    resumeAnimation: vi.fn(),
  };
  const state = {
    api,
    attachRef: true,
    forceMethods,
    latestProps: null as Record<string, unknown> | null,
  };
  const Component = (props: Record<string, unknown>) => {
    state.latestProps = props;
    const React = require("react");
    React.useEffect(() => {
      if (!state.attachRef) {
        return;
      }

      if (typeof props.ref === "function") {
        props.ref(api);
      } else if (props.ref && typeof props.ref === "object") {
        (props.ref as { current: typeof api | null }).current = api;
      }

      return () => {
        if (typeof props.ref === "function") {
          props.ref(null);
        } else if (props.ref && typeof props.ref === "object") {
          (props.ref as { current: typeof api | null }).current = null;
        }
      };
    }, [props.ref, state.attachRef]);

    if (!state.attachRef) {
      return React.createElement("div", { "data-testid": "force-graph" });
    }
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
  forceGraphMock.state.attachRef = true;
  forceGraphMock.state.latestProps = null;
  forceGraphMock.state.api.d3Force.mockClear();
  forceGraphMock.state.api.d3ReheatSimulation.mockClear();
  forceGraphMock.state.api.resumeAnimation.mockClear();
  forceGraphMock.state.forceMethods.charge.strength.mockClear();
  forceGraphMock.state.forceMethods.link.distance.mockClear();
  forceGraphMock.state.forceMethods.link.strength.mockClear();

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
        backgroundColor: "#ffffff",
        width: 720,
        height: 480,
      });
    });
    expect(screen.getByTestId("knowledge-graph-view").className).toContain("h-full min-h-0");
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
    expect(nodeColor?.(graph.nodes[2])).toBe("#64748b88");
    expect(linkColor?.(graph.links[0])).toBe("#64748b");
    expect(
      linkColor?.({
        id: "property:doc-2:status:active",
        source: "document:doc-2",
        target: "property:status:active",
        kind: "property",
      }),
    ).toBe("#94a3b844");
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

    expect(nodeColor?.(graph.nodes[0])).toBe("#64748b");
    expect(nodeColor?.(graph.nodes[1])).toBe("#f59e0b");
    expect(linkColor?.(graph.links[0])).toBe("#94a3b8");
  });

  it("renders display controls and maps them to graph display props", () => {
    renderGraph();

    expect(screen.getByText("Display")).toBeTruthy();
    expect(screen.getByLabelText("Arrows")).toBeTruthy();
    expect(screen.getByLabelText("Text fade threshold")).toBeTruthy();
    expect(screen.getByLabelText("Node size")).toBeTruthy();
    expect(screen.getByLabelText("Link thickness")).toBeTruthy();
    expect(forceGraphMock.state.latestProps).toMatchObject({
      linkDirectionalArrowLength: 0,
      nodeRelSize: 5,
    });

    fireEvent.click(screen.getByLabelText("Arrows"));
    fireEvent.change(screen.getByLabelText("Node size"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Link thickness"), { target: { value: "3" } });

    expect(forceGraphMock.state.latestProps).toMatchObject({
      linkDirectionalArrowLength: 4,
      nodeRelSize: 8,
    });

    const linkWidth = forceGraphMock.state.latestProps?.linkWidth as
      | ((link: KnowledgeGraphData["links"][number]) => number)
      | undefined;

    expect(linkWidth?.(createGraph().links[0])).toBe(4.5);

    fireEvent.click(screen.getByRole("button", { name: "Collapse display" }));

    expect(screen.queryByLabelText("Arrows")).toBeNull();
  });

  it("uses text fade threshold when drawing node labels", () => {
    const graph = createGraph();
    renderGraph(graph);

    fireEvent.change(screen.getByLabelText("Text fade threshold"), { target: { value: "2" } });

    const context = {
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      measureText: vi.fn(() => ({ width: 40 })),
      fillText: vi.fn(),
    };
    const nodeCanvasObject = forceGraphMock.state.latestProps?.nodeCanvasObject as
      | ((node: KnowledgeGraphData["nodes"][number] & { x: number; y: number }, ctx: typeof context, globalScale: number) => void)
      | undefined;

    nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 1);

    expect(context.fillStyle).toBe("rgba(100, 116, 139, 0.50)");
    expect(context.textAlign).toBe("center");
    expect(context.textBaseline).toBe("middle");
    expect(context.fillText).toHaveBeenCalledWith("Welcome", 20, 30);

    nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 0.1);

    expect(context.fillText).toHaveBeenCalledTimes(1);
  });

  it("resumes graph rendering when text fade threshold changes after force controls update", async () => {
    renderGraph();

    fireEvent.change(screen.getByLabelText("Repel force"), { target: { value: "-180" } });
    await waitFor(() => {
      expect(forceGraphMock.state.forceMethods.charge.strength).toHaveBeenLastCalledWith(-180);
    });
    forceGraphMock.state.api.resumeAnimation.mockClear();

    fireEvent.change(screen.getByLabelText("Text fade threshold"), { target: { value: "2" } });

    await waitFor(() => {
      expect(forceGraphMock.state.api.resumeAnimation).toHaveBeenCalled();
    });
  });

  it("renders force controls and applies force graph methods", async () => {
    renderGraph();

    expect(screen.getByText("Forces")).toBeTruthy();
    expect(screen.getByLabelText("Center force")).toBeTruthy();
    expect(screen.getByLabelText("Repel force")).toBeTruthy();
    expect(screen.getByLabelText("Link force")).toBeTruthy();
    expect(screen.getByLabelText("Link distance")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Center force"), { target: { value: "0.6" } });
    fireEvent.change(screen.getByLabelText("Repel force"), { target: { value: "-180" } });
    fireEvent.change(screen.getByLabelText("Link force"), { target: { value: "0.7" } });
    fireEvent.change(screen.getByLabelText("Link distance"), { target: { value: "120" } });

    await waitFor(() => {
      expect(forceGraphMock.state.api.d3Force).toHaveBeenCalledWith(
        "munjib-center",
        expect.objectContaining({ initialize: expect.any(Function) }),
      );
      expect(forceGraphMock.state.forceMethods.charge.strength).toHaveBeenLastCalledWith(-180);
      expect(forceGraphMock.state.forceMethods.link.strength).toHaveBeenLastCalledWith(0.7);
      expect(forceGraphMock.state.forceMethods.link.distance).toHaveBeenLastCalledWith(120);
    });

    const centerForceCall = forceGraphMock.state.api.d3Force.mock.calls.find(
      ([name]) => name === "munjib-center",
    );
    const centerForce = centerForceCall?.[1] as
      | (((alpha: number) => void) & { initialize: (nodes: Array<{ vx?: number; vy?: number; x: number; y: number }>) => void })
      | undefined;
    const node = { x: 10, y: -20, vx: 0, vy: 0 };
    centerForce?.initialize([node]);
    centerForce?.(0.5);

    expect(node.vx).toBeLessThan(0);
    expect(node.vy).toBeGreaterThan(0);
    expect(forceGraphMock.state.api.d3ReheatSimulation).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Collapse forces" }));

    expect(screen.queryByLabelText("Center force")).toBeNull();
  });

  it("applies default forces after the dynamic graph ref becomes available", async () => {
    forceGraphMock.state.attachRef = false;
    const { rerender } = render(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={createGraph()}
        selectedDocumentId="doc-1"
      />,
    );

    expect(forceGraphMock.state.api.d3Force).not.toHaveBeenCalled();

    forceGraphMock.state.attachRef = true;
    rerender(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={createGraph()}
        selectedDocumentId="doc-1"
      />,
    );

    await waitFor(() => {
      expect(forceGraphMock.state.api.d3Force).toHaveBeenCalledWith(
        "munjib-center",
        expect.objectContaining({ initialize: expect.any(Function) }),
      );
      expect(forceGraphMock.state.forceMethods.charge.strength).toHaveBeenLastCalledWith(-120);
      expect(forceGraphMock.state.forceMethods.link.strength).toHaveBeenLastCalledWith(0.4);
      expect(forceGraphMock.state.forceMethods.link.distance).toHaveBeenLastCalledWith(80);
    });
  });

  it("uses the hovered node neighborhood as the active highlight region", async () => {
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
        {
          id: "property:status:active",
          kind: "property",
          label: "status: active",
          key: "status",
          value: "active",
          valueType: "string",
        },
      ],
      links: [
        ...createGraph().links,
        {
          id: "property:doc-2:status:active",
          source: "document:doc-2",
          target: "property:status:active",
          kind: "property",
        },
      ],
    };
    renderGraph(graph);

    const onNodeHover = forceGraphMock.state.latestProps?.onNodeHover as
      | ((node: KnowledgeGraphData["nodes"][number] | null) => void)
      | undefined;
    onNodeHover?.(graph.nodes[3]);

    await waitFor(() => {
      const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
        | ((node: KnowledgeGraphData["nodes"][number]) => string)
        | undefined;
      expect(nodeColor?.(graph.nodes[0])).toBe("#64748b88");
    });

    const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
      | ((node: KnowledgeGraphData["nodes"][number]) => string)
      | undefined;
    const linkColor = forceGraphMock.state.latestProps?.linkColor as
      | ((link: KnowledgeGraphData["links"][number]) => string)
      | undefined;
    expect(nodeColor?.(graph.nodes[0])).toBe("#64748b88");
    expect(nodeColor?.(graph.nodes[2])).toBe("#64748b");
    expect(nodeColor?.(graph.nodes[3])).toBe("#38bdf8");
    expect(linkColor?.(graph.links[0])).toBe("#94a3b844");
    expect(linkColor?.(graph.links[1])).toBe("#64748b");

    onNodeHover?.(null);

    await waitFor(() => {
      const restoredNodeColor = forceGraphMock.state.latestProps?.nodeColor as
        | ((node: KnowledgeGraphData["nodes"][number]) => string)
        | undefined;
      expect(restoredNodeColor?.(graph.nodes[0])).toBe("#a78bfa");
    });

    const restoredNodeColor = forceGraphMock.state.latestProps?.nodeColor as
      | ((node: KnowledgeGraphData["nodes"][number]) => string)
      | undefined;
    const restoredLinkColor = forceGraphMock.state.latestProps?.linkColor as
      | ((link: KnowledgeGraphData["links"][number]) => string)
      | undefined;

    expect(restoredNodeColor?.(graph.nodes[0])).toBe("#a78bfa");
    expect(restoredLinkColor?.(graph.links[0])).toBe("#64748b");
  });

  it("ignores stale hovered nodes that are no longer in the visible graph", async () => {
    const graph = createGraph();
    renderGraph(graph);

    const onNodeHover = forceGraphMock.state.latestProps?.onNodeHover as
      | ((node: KnowledgeGraphData["nodes"][number] | null) => void)
      | undefined;
    onNodeHover?.({
      id: "document:deleted",
      kind: "document",
      label: "Deleted",
      documentId: "deleted",
      title: "Deleted",
      path: "/deleted",
    });

    await waitFor(() => {
      const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
        | ((node: KnowledgeGraphData["nodes"][number]) => string)
        | undefined;
      expect(nodeColor?.(graph.nodes[0])).toBe("#a78bfa");
    });

    const linkColor = forceGraphMock.state.latestProps?.linkColor as
      | ((link: KnowledgeGraphData["links"][number]) => string)
      | undefined;
    expect(linkColor?.(graph.links[0])).toBe("#64748b");
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
