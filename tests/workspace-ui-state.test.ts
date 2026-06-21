// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
  workspaceUiStateStorageKey,
} from "@/lib/workspace-ui-state";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
});

describe("workspace UI state storage", () => {
  it("uses a versioned workspace-scoped aggregate key", () => {
    expect(workspaceUiStateStorageKey("company-handbook")).toBe(
      "munjib:workspace-ui:company-handbook:v1",
    );
  });

  it("merges updates without replacing unrelated surfaces", () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        activeSidebarPanel: "favorites",
        graph: { settingsOpen: true },
      }),
    );

    updateStoredWorkspaceUiState("company-handbook", () => ({
      leftSidebarOpen: false,
      graph: {
        filters: { tag: true, orphans: false },
      },
    }));

    expect(readStoredWorkspaceUiState("company-handbook")).toEqual({
      activeSidebarPanel: "favorites",
      leftSidebarOpen: false,
      graph: {
        settingsOpen: true,
        filters: { tag: true, orphans: false },
      },
    });
  });

  it("ignores invalid stored fields and keeps valid fields", () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        leftSidebarOpen: "no",
        rightSidebarOpen: true,
        activeSidebarPanel: "graph",
        workspaceChatOpen: false,
        graph: {
          settingsOpen: true,
          filtersOpen: "yes",
          filters: { tag: true, orphans: "false" },
          display: {
            arrows: true,
            linkThickness: 20,
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

    expect(readStoredWorkspaceUiState("company-handbook")).toEqual({
      rightSidebarOpen: true,
      workspaceChatOpen: false,
      graph: {
        settingsOpen: true,
        forces: {
          center: 0.6,
          link: 0.7,
          linkDistance: 120,
          repel: -180,
        },
      },
    });
  });

  it("returns defaults when stored JSON is malformed", () => {
    window.localStorage.setItem(workspaceUiStateStorageKey("company-handbook"), "{");

    expect(readStoredWorkspaceUiState("company-handbook")).toEqual({});
  });

  it("merges graph updates without replacing unrelated graph subgroups", () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        graph: {
          display: {
            arrows: true,
            linkThickness: 2,
            nodeSize: 8,
            textFadeThreshold: 1.5,
          },
        },
      }),
    );

    updateStoredWorkspaceUiState("company-handbook", () => ({
      graph: {
        forces: {
          center: 0.6,
          link: 0.7,
          linkDistance: 120,
          repel: -180,
        },
      },
    }));

    expect(readStoredWorkspaceUiState("company-handbook")).toEqual({
      graph: {
        display: {
          arrows: true,
          linkThickness: 2,
          nodeSize: 8,
          textFadeThreshold: 1.5,
        },
        forces: {
          center: 0.6,
          link: 0.7,
          linkDistance: 120,
          repel: -180,
        },
      },
    });
  });

  it("does not leak state between workspaces", () => {
    updateStoredWorkspaceUiState("company-handbook", (current) => ({
      ...current,
      workspaceChatOpen: true,
    }));

    expect(readStoredWorkspaceUiState("research")).toEqual({});
  });

  it("returns defaults when storage reads or writes throw", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => {
          throw new Error("storage blocked");
        }),
        setItem: vi.fn(() => {
          throw new Error("quota exceeded");
        }),
      },
    });

    expect(readStoredWorkspaceUiState("company-handbook")).toEqual({});
    expect(() =>
      updateStoredWorkspaceUiState("company-handbook", (current) => ({
        ...current,
        leftSidebarOpen: false,
      })),
    ).not.toThrow();
  });
});
