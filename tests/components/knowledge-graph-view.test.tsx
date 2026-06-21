// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell, useTagSearch } from "@/components/app-shell";
import { I18nProvider } from "@/components/i18n-provider";
import { KnowledgeGraphView } from "@/components/knowledge-graph-view";
import type { KnowledgeGraphData } from "@/lib/knowledge-graph/model";
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";

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
    centerAt: vi.fn(),
    zoom: vi.fn(),
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

function createWikiGraphWithUnresolvedTarget(): KnowledgeGraphData {
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
        id: "document:doc-2",
        kind: "document",
        label: "Runbook",
        documentId: "doc-2",
        title: "Runbook",
        path: "/runbook",
      },
      {
        id: "document:doc-3",
        kind: "document",
        label: "Draft",
        documentId: "doc-3",
        title: "Draft",
        path: "/draft",
      },
      {
        id: "wiki:broken:missing",
        kind: "wiki",
        label: "Missing",
        targetTitleRaw: "Missing",
        state: "broken",
      },
    ],
    links: [
      {
        id: "wiki:doc-1:document:doc-2",
        source: "document:doc-1",
        target: "document:doc-2",
        kind: "wiki",
      },
      {
        id: "wiki:doc-3:wiki:broken:missing",
        source: "document:doc-3",
        target: "wiki:broken:missing",
        kind: "wiki",
      },
    ],
  };
}

function createDocumentCountGraph(documentCount: number): KnowledgeGraphData {
  const nodes = Array.from({ length: documentCount }, (_, index) => ({
    id: `document:doc-${index + 1}`,
    kind: "document" as const,
    label: `Document ${index + 1}`,
    documentId: `doc-${index + 1}`,
    title: `Document ${index + 1}`,
    path: `/document-${index + 1}`,
  }));

  return { nodes, links: [] };
}

function createTagOnlyDocumentGraph(documentCount: number): KnowledgeGraphData {
  const tagNode = {
    id: "tag:hidden",
    kind: "tag" as const,
    label: "#Hidden",
    name: "Hidden",
    normalizedName: "hidden",
  };
  const documentNodes = Array.from({ length: documentCount }, (_, index) => ({
    id: `document:doc-${index + 1}`,
    kind: "document" as const,
    label: `Document ${index + 1}`,
    documentId: `doc-${index + 1}`,
    title: `Document ${index + 1}`,
    path: `/document-${index + 1}`,
  }));
  const links = documentNodes.map((node) => ({
    id: `tag:${node.documentId}:hidden`,
    source: node.id,
    target: tagNode.id,
    kind: "tag" as const,
  }));

  return { nodes: [...documentNodes, tagNode], links };
}

function renderGraph(graph = createGraph()) {
  return renderWithI18n(
    <KnowledgeGraphView
      workspaceSlug="company-handbook"
      graph={graph}
      selectedDocumentId="doc-1"
    />,
  );
}

function TagSearchReceiver() {
  const tagSearch = useTagSearch();

  return (
    <span data-testid="tag-search-request">
      {tagSearch?.latestTagSearchRequest?.tagName ?? ""}
    </span>
  );
}

function renderGraphInShell(graph = createGraph()) {
  return renderWithI18n(
    <AppShell
      left={<TagSearchReceiver />}
      center={
        <KnowledgeGraphView
          workspaceSlug="company-handbook"
          graph={graph}
          selectedDocumentId="doc-1"
        />
      }
      right={<div />}
    />,
  );
}

function renderWithI18n(ui: React.ReactElement) {
  const result = render(<I18nProvider>{ui}</I18nProvider>);
  return {
    ...result,
    rerender: (nextUi: React.ReactElement) => result.rerender(<I18nProvider>{nextUi}</I18nProvider>),
  };
}

const workspaceStateKey = workspaceUiStateStorageKey("company-handbook");
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

function createStorageMock() {
  const values = new Map<string, string>();

  return {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function getStoredWorkspaceUiState() {
  return JSON.parse(window.localStorage.getItem(workspaceStateKey) ?? "{}") as Record<
    string,
    unknown
  >;
}

function getInput(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function parseCanvasFont(font: string) {
  const match = font.match(/^([0-9.]+)px (.+)$/);

  return {
    fontSize: match ? Number(match[1]) : Number.NaN,
    family: match?.[2] ?? "",
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  router.push.mockReset();
  forceGraphMock.state.attachRef = true;
  forceGraphMock.state.latestProps = null;
  forceGraphMock.state.api.d3Force.mockClear();
  forceGraphMock.state.api.d3ReheatSimulation.mockClear();
  forceGraphMock.state.api.resumeAnimation.mockClear();
  forceGraphMock.state.api.centerAt.mockClear();
  forceGraphMock.state.api.zoom.mockClear();
  forceGraphMock.state.forceMethods.charge.strength.mockClear();
  forceGraphMock.state.forceMethods.link.distance.mockClear();
  forceGraphMock.state.forceMethods.link.strength.mockClear();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createStorageMock(),
  });

  Object.defineProperties(HTMLElement.prototype, {
    clientWidth: { configurable: true, get: () => 720 },
    clientHeight: { configurable: true, get: () => 480 },
  });
});

afterEach(() => {
  cleanup();
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
});

describe("KnowledgeGraphView", () => {
  it("renders force graph and persists the settings panel open state", async () => {
    renderGraph();

    expect(screen.getByTestId("force-graph")).toBeTruthy();
    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.queryByLabelText("Wiki links")).toBeNull();
    expect(getInput("Tags").checked).toBe(false);
    expect(getInput("Orphans").checked).toBe(false);
    expect(screen.queryByLabelText("Properties")).toBeNull();

    const controls = screen.getByTestId("knowledge-graph-controls");
    expect(controls.className).toContain("right-4");
    expect(controls.className).toContain("bg-muted");
    const filtersToggle = screen.getByRole("button", { name: "Collapse filters" });
    expect(filtersToggle.textContent).toContain("Filters");
    expect(screen.getByRole("button", { name: "Close graph settings" }).parentElement).toBe(
      filtersToggle.parentElement,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close graph settings" }));

    expect(screen.queryByText("Filters")).toBeNull();
    expect(screen.queryByLabelText("Wiki links")).toBeNull();
    expect(screen.queryByLabelText("Tags")).toBeNull();
    expect(screen.queryByLabelText("Orphans")).toBeNull();
    expect(screen.queryByLabelText("Properties")).toBeNull();
    await waitFor(() => {
      expect(getStoredWorkspaceUiState()).toMatchObject({
        graph: { settingsOpen: false },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Open graph settings" }));

    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand display" }).textContent).toContain(
      "Display",
    );
    expect(screen.getByRole("button", { name: "Expand forces" }).textContent).toContain(
      "Forces",
    );
    expect(screen.queryByLabelText("Wiki links")).toBeNull();
    expect(getInput("Tags").checked).toBe(false);
    expect(getInput("Orphans").checked).toBe(false);
    expect(screen.queryByLabelText("Properties")).toBeNull();
    await waitFor(() => {
      expect(getStoredWorkspaceUiState()).toMatchObject({
        graph: { settingsOpen: true },
      });
    });
  });

  it("uses the selected Korean display language for graph controls", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    renderGraph();

    expect(await screen.findByText("필터")).toBeTruthy();
    expect(getInput("태그").checked).toBe(false);
    expect(getInput("고립 문서").checked).toBe(false);
    expect(screen.getByRole("button", { name: "그래프 설정 닫기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "표시 펼치기" }));
    expect(screen.getByLabelText("화살표")).toBeTruthy();
    expect(screen.getByLabelText("텍스트 페이드 기준")).toBeTruthy();
    expect(screen.getByLabelText("노드 크기")).toBeTruthy();
    expect(screen.getByLabelText("링크 두께")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "힘 설정 펼치기" }));
    expect(screen.getByLabelText("중심 힘")).toBeTruthy();
    expect(screen.getByLabelText("반발 힘")).toBeTruthy();
    expect(screen.getByLabelText("링크 힘")).toBeTruthy();
    expect(screen.getByLabelText("링크 거리")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "그래프 설정 닫기" }));
    expect(screen.getByRole("button", { name: "그래프 설정 열기" })).toBeTruthy();
  });

  it("starts tag filtering disabled and restores tag links when Tags is checked", () => {
    const graph = createGraph();
    renderGraph();

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [],
      links: [],
    });

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: graph.nodes,
      links: graph.links.map((link) => ({
        ...link,
        sourceId: link.source,
        targetId: link.target,
      })),
    });
  });

  it("hides unresolved wiki target nodes from the default rendered graph", () => {
    const graph = createWikiGraphWithUnresolvedTarget();
    renderGraph(graph);

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[0], graph.nodes[1]],
      links: [
        {
          ...graph.links[0],
          sourceId: graph.links[0].source,
          targetId: graph.links[0].target,
        },
      ],
    });
  });

  it("keeps unresolved wiki target nodes hidden when Orphans is checked", () => {
    const graph = createWikiGraphWithUnresolvedTarget();
    renderGraph(graph);

    fireEvent.click(screen.getByLabelText("Orphans"));

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[0], graph.nodes[1], graph.nodes[2]],
      links: [
        {
          ...graph.links[0],
          sourceId: graph.links[0].source,
          targetId: graph.links[0].target,
        },
      ],
    });
  });

  it("persists filters, display, and forces in aggregate workspace UI storage", async () => {
    window.localStorage.setItem(
      workspaceStateKey,
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    renderGraph();

    fireEvent.click(screen.getByLabelText("Tags"));
    fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
    fireEvent.change(screen.getByLabelText("Node size"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));
    fireEvent.change(screen.getByLabelText("Repel force"), { target: { value: "-180" } });

    await waitFor(() => {
      expect(getStoredWorkspaceUiState()).toEqual({
        activeSidebarPanel: "favorites",
        graph: {
          settingsOpen: true,
          filtersOpen: true,
          displayOpen: true,
          forcesOpen: true,
          filters: { tag: true, orphans: false },
          display: {
            arrows: false,
            linkThickness: 1,
            nodeSize: 8,
            textFadeThreshold: 1,
          },
          forces: {
            center: 0.3,
            link: 0.4,
            linkDistance: 80,
            repel: -180,
          },
        },
      });
    });
  });

  it("restores valid workspace graph settings from aggregate workspace UI storage", async () => {
    window.localStorage.setItem(
      workspaceStateKey,
      JSON.stringify({
        graph: {
          settingsOpen: true,
          filtersOpen: true,
          displayOpen: true,
          forcesOpen: true,
          filters: { tag: true, orphans: true },
          display: {
            arrows: true,
            linkThickness: 3,
            nodeSize: 8,
            textFadeThreshold: 2,
          },
          forces: {
            center: 0.6,
            link: 0.7,
            linkDistance: 120,
            repel: -180,
          },
        },
      }),
    );

    renderGraph();

    await waitFor(() => {
      expect(getInput("Tags").checked).toBe(true);
      expect(getInput("Orphans").checked).toBe(true);
    });

    expect(screen.getByRole("button", { name: "Collapse display" }).textContent).toContain(
      "Display",
    );
    expect(getInput("Arrows").checked).toBe(true);
    expect(getInput("Node size").value).toBe("8");
    expect(getInput("Text fade threshold").value).toBe("2");
    expect(getInput("Link thickness").value).toBe("3");

    expect(screen.getByRole("button", { name: "Collapse forces" }).textContent).toContain(
      "Forces",
    );
    expect(getInput("Center force").value).toBe("0.6");
    expect(getInput("Repel force").value).toBe("-180");
    expect(getInput("Link force").value).toBe("0.7");
    expect(getInput("Link distance").value).toBe("120");
  });

  it("ignores invalid stored graph values and keeps defaults", async () => {
    window.localStorage.setItem(
      workspaceStateKey,
      JSON.stringify({
        graph: {
          settingsOpen: "yes",
          filtersOpen: "yes",
          displayOpen: true,
          forcesOpen: true,
          filters: { tag: true, orphans: "yes" },
          display: {
            arrows: false,
            linkThickness: 20,
            nodeSize: 8,
            textFadeThreshold: 2,
          },
          forces: "not-json",
        },
      }),
    );

    renderGraph();

    await waitFor(() => {
      expect(window.localStorage.getItem).toHaveBeenCalledWith(workspaceStateKey);
    });

    expect(screen.getByRole("button", { name: "Collapse filters" }).textContent).toContain(
      "Filters",
    );
    expect(getInput("Tags").checked).toBe(false);
    expect(getInput("Orphans").checked).toBe(false);

    expect(screen.getByRole("button", { name: "Collapse display" }).textContent).toContain(
      "Display",
    );
    expect(getInput("Node size").value).toBe("3");
    expect(getInput("Link thickness").value).toBe("1");

    expect(screen.getByRole("button", { name: "Collapse forces" }).textContent).toContain(
      "Forces",
    );
    expect(getInput("Repel force").value).toBe("-120");
  });

  it("keeps rendering when workspace UI storage reads throw during mount", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        ...createStorageMock(),
        getItem: vi.fn(() => {
          throw new Error("workspace UI storage blocked");
        }),
      },
    });

    renderGraph();

    expect(screen.getByTestId("force-graph")).toBeTruthy();
    expect(getInput("Tags").checked).toBe(false);

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(getInput("Tags").checked).toBe(true);
    expect(forceGraphMock.state.latestProps?.graphData).toMatchObject({
      links: [expect.objectContaining({ id: "tag:doc-1:design" })],
    });
  });

  it("keeps interactions working when workspace UI storage writes throw during persistence", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        ...createStorageMock(),
        setItem: vi.fn(() => {
          throw new Error("workspace UI storage quota exceeded");
        }),
      },
    });

    renderGraph();

    await waitFor(() => {
      expect(window.localStorage.getItem).toHaveBeenCalledWith(workspaceStateKey);
    });

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(getInput("Tags").checked).toBe(true);
    expect(forceGraphMock.state.latestProps?.graphData).toMatchObject({
      links: [expect.objectContaining({ id: "tag:doc-1:design" })],
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
    fireEvent.click(screen.getByLabelText("Tags"));

    const renderedGraph = forceGraphMock.state.latestProps?.graphData as {
      nodes: Array<KnowledgeGraphData["nodes"][number]>;
      links: Array<KnowledgeGraphData["links"][number]>;
    };
    renderedGraph.links[0].source = graph.nodes[0] as never;
    renderedGraph.links[0].target = graph.nodes[1] as never;

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [],
      links: [],
    });
    expect(graph.links[0].source).toBe("document:doc-1");
    expect(graph.links[0].target).toBe("tag:design");
  });

  it("preserves renderer object identity across filter toggles", () => {
    const graph = createGraph();
    renderGraph(graph);
    fireEvent.click(screen.getByLabelText("Tags"));

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
    const baseGraph = createGraph();
    const graph: KnowledgeGraphData = {
      nodes: [
        ...baseGraph.nodes,
        {
          id: "document:doc-2",
          kind: "document",
          label: "Unrelated",
          documentId: "doc-2",
          title: "Unrelated",
          path: "/unrelated",
        },
        {
          id: "document:doc-3",
          kind: "document",
          label: "Also unrelated",
          documentId: "doc-3",
          title: "Also unrelated",
          path: "/also-unrelated",
        },
      ],
      links: [
        ...baseGraph.links,
        {
          id: "wiki:doc-2:document:doc-3",
          source: "document:doc-2",
          target: "document:doc-3",
          kind: "wiki",
        },
      ],
    };
    renderGraph(graph);
    fireEvent.click(screen.getByLabelText("Tags"));

    const renderedGraph = forceGraphMock.state.latestProps?.graphData as {
      nodes: Array<KnowledgeGraphData["nodes"][number]>;
      links: Array<KnowledgeGraphData["links"][number]>;
    };
    const selectedDocumentNode = renderedGraph.nodes.find((node) => node.id === "document:doc-1");
    const tagNode = renderedGraph.nodes.find((node) => node.id === "tag:design");
    const unfocusedDocumentNode = renderedGraph.nodes.find((node) => node.id === "document:doc-2");
    const tagLink = renderedGraph.links.find((link) => link.id === "tag:doc-1:design");
    const unfocusedWikiLink = renderedGraph.links.find(
      (link) => link.id === "wiki:doc-2:document:doc-3",
    );

    const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
      | ((node: KnowledgeGraphData["nodes"][number]) => string)
      | undefined;
    const linkColor = forceGraphMock.state.latestProps?.linkColor as
      | ((link: KnowledgeGraphData["links"][number]) => string)
      | undefined;

    expect(selectedDocumentNode).toBeDefined();
    expect(tagNode).toBeDefined();
    expect(unfocusedDocumentNode).toBeDefined();
    expect(tagLink).toBeDefined();
    expect(unfocusedWikiLink).toBeDefined();
    expect(nodeColor?.(selectedDocumentNode!)).toBe("#a78bfa");
    expect(nodeColor?.(tagNode!)).toBe("#f59e0b");
    expect(nodeColor?.(unfocusedDocumentNode!)).toBe("#64748b88");
    expect(linkColor?.(tagLink!)).toBe("#64748b");
    expect(linkColor?.(unfocusedWikiLink!)).toBe("#94a3b844");
  });

  it("does not dim visible wiki-linked nodes when the selected document is filtered out", () => {
    const graph: KnowledgeGraphData = {
      nodes: [
        {
          id: "document:doc-1",
          kind: "document",
          label: "Tagged",
          documentId: "doc-1",
          title: "Tagged",
          path: "/tagged",
        },
        {
          id: "tag:hidden",
          kind: "tag",
          label: "#Hidden",
          name: "Hidden",
          normalizedName: "hidden",
        },
        {
          id: "document:doc-2",
          kind: "document",
          label: "Linked",
          documentId: "doc-2",
          title: "Linked",
          path: "/linked",
        },
        {
          id: "document:doc-3",
          kind: "document",
          label: "Neighbor",
          documentId: "doc-3",
          title: "Neighbor",
          path: "/neighbor",
        },
      ],
      links: [
        {
          id: "tag:doc-1:hidden",
          source: "document:doc-1",
          target: "tag:hidden",
          kind: "tag",
        },
        {
          id: "wiki:doc-2:document:doc-3",
          source: "document:doc-2",
          target: "document:doc-3",
          kind: "wiki",
        },
      ],
    };
    renderGraph(graph);

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[2], graph.nodes[3]],
      links: [
        {
          ...graph.links[1],
          sourceId: graph.links[1].source,
          targetId: graph.links[1].target,
        },
      ],
    });

    const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
      | ((node: KnowledgeGraphData["nodes"][number]) => string)
      | undefined;
    const linkColor = forceGraphMock.state.latestProps?.linkColor as
      | ((link: KnowledgeGraphData["links"][number]) => string)
      | undefined;

    expect(nodeColor?.(graph.nodes[2])).toBe("#64748b");
    expect(nodeColor?.(graph.nodes[3])).toBe("#64748b");
    expect(linkColor?.(graph.links[1])).toBe("#94a3b8");
  });

  it("does not dim the graph when no document is selected", () => {
    const graph = createGraph();
    renderWithI18n(
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
    expect(screen.queryByLabelText("Arrows")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand display" }));

    expect(screen.getByLabelText("Arrows")).toBeTruthy();
    expect(screen.getByLabelText("Text fade threshold")).toBeTruthy();
    const nodeSizeInput = screen.getByLabelText("Node size");
    const linkThicknessInput = screen.getByLabelText("Link thickness");
    expect(nodeSizeInput.getAttribute("min")).toBe("1");
    expect(nodeSizeInput.getAttribute("max")).toBe("10");
    expect(linkThicknessInput.getAttribute("max")).toBe("5");
    expect(forceGraphMock.state.latestProps).toMatchObject({
      linkDirectionalArrowLength: 0,
      maxZoom: 3.5,
      minZoom: 0.35,
      nodeRelSize: 2.55,
    });

    fireEvent.click(screen.getByLabelText("Arrows"));
    fireEvent.change(screen.getByLabelText("Node size"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Link thickness"), { target: { value: "3" } });

    expect(forceGraphMock.state.latestProps).toMatchObject({
      linkDirectionalArrowLength: 4,
      nodeRelSize: 6.8,
    });

    const linkWidth = forceGraphMock.state.latestProps?.linkWidth as
      | ((link: KnowledgeGraphData["links"][number]) => number)
      | undefined;

    expect(linkWidth?.(createGraph().links[0])).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "Collapse display" }));

    expect(screen.queryByLabelText("Arrows")).toBeNull();
  });

  it("sets the initial graph zoom around the selected document once after coordinates are ready", async () => {
    const graph: KnowledgeGraphData = {
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
          id: "document:doc-2",
          kind: "document",
          label: "Runbook",
          documentId: "doc-2",
          title: "Runbook",
          path: "/runbook",
        },
      ],
      links: [
        {
          id: "wiki:doc-1:document:doc-2",
          source: "document:doc-1",
          target: "document:doc-2",
          kind: "wiki",
        },
      ],
    };
    const { rerender } = renderGraph(graph);

    expect(forceGraphMock.state.api.zoom).not.toHaveBeenCalled();

    const onRenderFramePost = forceGraphMock.state.latestProps?.onRenderFramePost as
      | (() => void)
      | undefined;
    onRenderFramePost?.();

    expect(forceGraphMock.state.api.zoom).not.toHaveBeenCalled();
    expect(forceGraphMock.state.api.centerAt).not.toHaveBeenCalled();

    const renderedGraph = forceGraphMock.state.latestProps?.graphData as {
      nodes: Array<KnowledgeGraphData["nodes"][number] & { x?: number; y?: number }>;
    };
    renderedGraph.nodes[0].x = 42;
    renderedGraph.nodes[0].y = -16;
    onRenderFramePost?.();

    expect(forceGraphMock.state.api.zoom).toHaveBeenCalledWith(2.5, 0);
    expect(forceGraphMock.state.api.centerAt).toHaveBeenCalledWith(42, -16, 0);
    expect(forceGraphMock.state.api.zoom).toHaveBeenCalledTimes(1);
    expect(forceGraphMock.state.api.centerAt).toHaveBeenCalledTimes(1);

    rerender(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={graph}
        selectedDocumentId="doc-1"
      />,
    );
    const nextOnRenderFramePost = forceGraphMock.state.latestProps?.onRenderFramePost as
      | (() => void)
      | undefined;
    nextOnRenderFramePost?.();

    expect(forceGraphMock.state.api.zoom).toHaveBeenCalledTimes(1);
    expect(forceGraphMock.state.api.centerAt).toHaveBeenCalledTimes(1);
  });

  it("scales node size baseline down as document count grows", () => {
    const { rerender } = renderWithI18n(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={createDocumentCountGraph(20)}
        selectedDocumentId={null}
      />,
    );

    expect(forceGraphMock.state.latestProps?.nodeRelSize).toBe(2.55);

    rerender(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={createDocumentCountGraph(120)}
        selectedDocumentId={null}
      />,
    );

    expect(forceGraphMock.state.latestProps?.nodeRelSize).toBe(1.65);

    rerender(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={createDocumentCountGraph(260)}
        selectedDocumentId={null}
      />,
    );

    expect(forceGraphMock.state.latestProps?.nodeRelSize).toBe(1.35);
  });

  it("sizes nodes from the total workspace document count even when filters hide every node", () => {
    renderGraph(createTagOnlyDocumentGraph(120));

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [],
      links: [],
    });
    expect(forceGraphMock.state.latestProps?.nodeRelSize).toBe(1.65);
  });

  it("uses text fade threshold when drawing node labels", () => {
    const graph = createGraph();
    renderGraph(graph);

    fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
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

    expect(parseCanvasFont(context.font)).toEqual({
      fontSize: 8,
      family: "sans-serif",
    });
    expect(context.fillStyle).toBe("rgba(100, 116, 139, 0.50)");
    expect(context.textAlign).toBe("center");
    expect(context.textBaseline).toBe("middle");
    expect(context.fillText).toHaveBeenCalledWith("Welcome", 20, 41.55);

    nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 3.5);
    expect(parseCanvasFont(context.font)).toEqual({
      fontSize: 4.27617987059879,
      family: "sans-serif",
    });
    expect(context.fillText).toHaveBeenLastCalledWith("Welcome", 20, 36.116661363870826);

    nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 0.75);
    const expandedFont = parseCanvasFont(context.font);
    expect(expandedFont.fontSize).toBeCloseTo(9.2376, 4);
    expect(expandedFont.family).toBe("sans-serif");

    nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 0.1);

    expect(context.fillText).toHaveBeenCalledTimes(3);
  });

  it("hides node labels when the graph is zoomed too far out", () => {
    const graph = createGraph();
    renderGraph(graph);

    fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
    const context = {
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      fillText: vi.fn(),
    };
    const nodeCanvasObject = forceGraphMock.state.latestProps?.nodeCanvasObject as
      | ((node: KnowledgeGraphData["nodes"][number] & { x: number; y: number }, ctx: typeof context, globalScale: number) => void)
      | undefined;

    nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 0.6);

    expect(context.fillText).not.toHaveBeenCalled();
  });

  it("resumes graph rendering when text fade threshold changes after force controls update", async () => {
    renderGraph();

    fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));
    fireEvent.change(screen.getByLabelText("Repel force"), { target: { value: "-180" } });
    await waitFor(() => {
      expect(forceGraphMock.state.forceMethods.charge.strength).toHaveBeenLastCalledWith(-180);
    });
    forceGraphMock.state.api.resumeAnimation.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
    fireEvent.change(screen.getByLabelText("Text fade threshold"), { target: { value: "2" } });

    await waitFor(() => {
      expect(forceGraphMock.state.api.resumeAnimation).toHaveBeenCalled();
    });
  });

  it("renders force controls and applies force graph methods", async () => {
    renderGraph();

    expect(screen.getByText("Forces")).toBeTruthy();
    expect(screen.queryByLabelText("Center force")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));

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
    const { rerender } = renderWithI18n(
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
          id: "document:doc-3",
          kind: "document",
          label: "Neighbor",
          documentId: "doc-3",
          title: "Neighbor",
          path: "/neighbor",
        },
      ],
      links: [
        ...createGraph().links,
        {
          id: "wiki:doc-2:document:doc-3",
          source: "document:doc-2",
          target: "document:doc-3",
          kind: "wiki",
        },
      ],
    };
    renderGraph(graph);
    fireEvent.click(screen.getByLabelText("Tags"));

    const onNodeHover = forceGraphMock.state.latestProps?.onNodeHover as
      | ((node: KnowledgeGraphData["nodes"][number] | null) => void)
      | undefined;
    onNodeHover?.(graph.nodes[3]);

    await waitFor(() => {
      const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
        | ((node: KnowledgeGraphData["nodes"][number]) => string)
        | undefined;
      expect(nodeColor?.(graph.nodes[0])).toBe("#64748b33");
    });

    const nodeColor = forceGraphMock.state.latestProps?.nodeColor as
      | ((node: KnowledgeGraphData["nodes"][number]) => string)
      | undefined;
    const linkColor = forceGraphMock.state.latestProps?.linkColor as
      | ((link: KnowledgeGraphData["links"][number]) => string)
      | undefined;
    expect(nodeColor?.(graph.nodes[0])).toBe("#64748b33");
    expect(nodeColor?.(graph.nodes[2])).toBe("#64748b");
    expect(nodeColor?.(graph.nodes[3])).toBe("#64748b");
    expect(linkColor?.(graph.links[0])).toBe("#94a3b844");
    expect(linkColor?.(graph.links[1])).toBe("#64748b");

    const context = {
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      fillText: vi.fn(),
    };
    const nodeCanvasObject = forceGraphMock.state.latestProps?.nodeCanvasObject as
      | ((node: KnowledgeGraphData["nodes"][number] & { x: number; y: number }, ctx: typeof context, globalScale: number) => void)
      | undefined;

    nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 1);
    expect(context.fillStyle).toBe("rgba(100, 116, 139, 0.20)");

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
    expect(linkColor?.(graph.links[0])).toBe("#94a3b8");
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

  it("requests sidebar tag search when a tag node is clicked", async () => {
    const graph = createGraph();
    renderGraphInShell(graph);

    const onNodeClick = forceGraphMock.state.latestProps?.onNodeClick as
      | ((node: (typeof graph.nodes)[number]) => void)
      | undefined;

    onNodeClick?.(graph.nodes[1]);

    await waitFor(() => {
      expect(screen.getByTestId("tag-search-request").textContent).toBe("Design");
    });
    expect(router.push).not.toHaveBeenCalled();
  });
});
