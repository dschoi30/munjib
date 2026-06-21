// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CollapsedPanelLoadingSkeleton,
  DocumentNavigationBodySkeleton,
  WorkspaceSidebarLoadingSkeleton,
} from "@/components/sidebar-loading-skeleton";

afterEach(() => {
  cleanup();
});

describe("sidebar loading skeletons", () => {
  it("renders left sidebar loading rows as decorative shapes", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="left" />);

    const loading = screen.getByTestId("left-sidebar-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(within(loading).getAllByTestId("skeleton-row")).toHaveLength(9);
    expect(loading.textContent).toBe("");
  });

  it("renders right metadata loading rows as decorative shapes", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="right" />);

    const loading = screen.getByTestId("right-sidebar-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(within(loading).getAllByTestId("skeleton-row")).toHaveLength(5);
    expect(loading.textContent).toBe("");
  });

  it("renders a collapsed panel loading shape without text", () => {
    render(<CollapsedPanelLoadingSkeleton side="left" />);

    const loading = screen.getByTestId("left-collapsed-panel-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(loading.textContent).toBe("");
  });

  it("renders a navigation body skeleton for mounted localized chrome", () => {
    render(<DocumentNavigationBodySkeleton />);

    const loading = screen.getByTestId("document-navigation-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(within(loading).getAllByTestId("skeleton-row").length).toBeGreaterThan(6);
  });
});
