// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function renderGraph() {
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
    renderGraph();

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[0]],
      links: [],
    });
  });

  it("routes document node clicks to the selected workspace document", () => {
    renderGraph();

    const onNodeClick = forceGraphMock.state.latestProps?.onNodeClick as
      | ((node: (typeof graph.nodes)[number]) => void)
      | undefined;

    onNodeClick?.(graph.nodes[0]);

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
  });
});
