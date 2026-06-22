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
  it("renders left sidebar loading chrome and toolbar slots", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="left" />);

    const loading = screen.getByTestId("left-sidebar-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(loading.className).not.toContain("pt-2");
    expect(loading.className).not.toContain("space-y-4");
    expect(screen.getByTestId("left-sidebar-loading-chrome").className).toContain("h-11");
    expect(screen.getByTestId("left-sidebar-loading-toolbar").className).toContain("justify-between");
    expect(loading.textContent).toBe("");
  });

  it("renders right metadata loading toolbar and rows", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="right" />);

    const loading = screen.getByTestId("right-sidebar-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("right-sidebar-loading-toolbar").className).toContain("gap-1");
    expect(within(loading).getAllByTestId("metadata-row-skeleton")).toHaveLength(5);
    expect(loading.textContent).toBe("");
  });

  it("matches left sidebar chrome and toolbar slots", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="left" />);

    const loading = screen.getByTestId("left-sidebar-loading");
    const chrome = screen.getByTestId("left-sidebar-loading-chrome");
    const toolbar = screen.getByTestId("left-sidebar-loading-toolbar");

    expect(chrome.className).toContain("h-11");
    expect(toolbar.className).toContain("mb-4");
    expect(toolbar.className).toContain("h-11");
    expect(toolbar.className).toContain("justify-between");
    expect(within(toolbar).getAllByTestId("sidebar-toolbar-icon-skeleton")).toHaveLength(6);
    expect(loading.textContent).toBe("");
  });

  it("renders document rows as uniform full-width text slots with no icon", () => {
    render(<DocumentNavigationBodySkeleton />);

    const loading = screen.getByTestId("document-navigation-loading");
    const documentRows = within(loading).getAllByTestId("document-row-skeleton");

    expect(documentRows.length).toBeGreaterThan(4);
    for (const row of documentRows) {
      expect(row.className).toContain("px-2");
      expect(row.className).toContain("py-1.5");
      expect(within(row).queryByTestId("folder-row-icon-skeleton")).toBeNull();
      expect(within(row).getByTestId("document-row-text-skeleton").className).toContain("w-full");
    }
  });

  it("renders folder rows with the real chevron slot and full-width text", () => {
    render(<DocumentNavigationBodySkeleton />);

    const loading = screen.getByTestId("document-navigation-loading");
    const folderRows = within(loading).getAllByTestId("folder-row-skeleton");

    expect(folderRows.length).toBeGreaterThan(1);
    for (const row of folderRows) {
      expect(row.className).toContain("gap-1");
      expect(row.className).toContain("px-2");
      expect(row.className).toContain("py-1.5");
      expect(within(row).getByTestId("folder-row-icon-skeleton").className).toContain("h-4");
      expect(within(row).getByTestId("folder-row-icon-skeleton").className).toContain("w-4");
      expect(within(row).getByTestId("folder-row-text-skeleton").className).toContain("w-full");
    }
  });

  it("matches right metadata toolbar compact spacing", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="right" />);

    const toolbar = screen.getByTestId("right-sidebar-loading-toolbar");

    expect(toolbar.className).toContain("h-11");
    expect(toolbar.className).toContain("gap-1");
    expect(within(toolbar).getAllByTestId("sidebar-toolbar-icon-skeleton")).toHaveLength(5);
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
    expect(loading.className).not.toContain("space-y-4");
    expect(within(loading).getAllByTestId("document-row-skeleton").length).toBe(6);
    expect(within(loading).getAllByTestId("folder-row-skeleton").length).toBe(3);
  });
});
