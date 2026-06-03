// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCenterShell } from "@/components/workspace-center-shell";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const documents = [
  { id: "doc-1", title: "Welcome", path: "/welcome" },
  { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
  { id: "doc-3", title: "Operations Runbook", path: "/operations/runbook" },
];

beforeEach(() => {
  let store: Record<string, string> = {};
  router.push.mockReset();
  router.replace.mockReset();
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  vi.spyOn(window.history, "forward").mockImplementation(() => {});

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: () => {
        store = {};
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderShell(selectedDocument = documents[0]) {
  return render(
    <WorkspaceCenterShell
      workspaceSlug="company-handbook"
      documents={documents}
      selectedDocument={selectedDocument}
      selectedFolder={null}
    >
      <div>Editor content</div>
    </WorkspaceCenterShell>,
  );
}

describe("WorkspaceCenterShell", () => {
  it("adds the selected document as the active tab and shows the path", () => {
    renderShell();

    expect(screen.getByRole("button", { name: "Welcome" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("welcome")).toBeTruthy();
    expect(screen.getByText("Editor content")).toBeTruthy();
  });

  it("shows a single toolbar mode toggle for the next document mode", () => {
    renderShell();

    const scrollContainer = screen.getByTestId("workspace-scroll-container");
    scrollContainer.scrollTop = 180;

    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(scrollContainer.scrollTop).toBe(180);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
  });

  it("renders stored readable tabs and switches by router push", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([
        { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
        { id: "tab-2", documentId: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
      ]),
    );

    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Engineering Runbook" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-2");
  });

  it("routes to the stored active tab when the workspace opens without a selected document", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([
        { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
        { id: "tab-2", documentId: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
      ]),
    );
    window.localStorage.setItem("munjib:open-tabs-active:company-handbook", "tab-2");

    render(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={null}
        selectedFolder={null}
      >
        <div>Select a document or folder.</div>
      </WorkspaceCenterShell>,
    );

    expect(screen.getByRole("button", { name: "Engineering Runbook" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(router.replace).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-2");
  });

  it("closes the active tab and routes to the next tab", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([
        { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
        { id: "tab-2", documentId: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
      ]),
    );
    window.localStorage.setItem("munjib:open-tabs-active:company-handbook", "tab-1");

    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Close Welcome" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-2");
  });

  it("routes to the workspace root after closing the final active tab", () => {
    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Close Welcome" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  it("closes an inactive tab without leaving the selected folder view", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([
        { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
        { id: "tab-2", documentId: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
      ]),
    );
    window.localStorage.setItem("munjib:open-tabs-active:company-handbook", "tab-2");

    render(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={null}
        selectedFolder={{ path: "/operations" }}
      >
        <div>Folder content</div>
      </WorkspaceCenterShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close Welcome" }));

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText("operations")).toBeTruthy();
    expect(screen.getByText("Folder content")).toBeTruthy();
  });

  it("shows graph toolbar state without document mode controls", () => {
    render(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={documents[0]}
        selectedFolder={null}
        isGraphView={true}
      >
        <div>Graph content</div>
      </WorkspaceCenterShell>,
    );

    expect(screen.getByText("Graph view")).toBeTruthy();
    expect(screen.getByText("Graph content")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
  });

  it("keeps graph content mounted in the workspace scroll container", () => {
    render(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={null}
        selectedFolder={null}
        isGraphView={true}
      >
        <div data-testid="graph-view">Graph content</div>
      </WorkspaceCenterShell>,
    );

    expect(screen.getByTestId("workspace-scroll-container").contains(screen.getByTestId("graph-view"))).toBe(true);
  });

  it("lets graph content fill the center area without scroll padding", () => {
    render(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={null}
        selectedFolder={null}
        isGraphView={true}
      >
        <div data-testid="graph-view">Graph content</div>
      </WorkspaceCenterShell>,
    );

    expect(screen.getByTestId("workspace-scroll-container").className).toContain("overflow-hidden p-0");
  });

  it("replaces the current tab when a different document is selected", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([{ id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" }]),
    );
    window.localStorage.setItem("munjib:open-tabs-active:company-handbook", "tab-1");

    const { rerender } = renderShell(documents[0]);

    rerender(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={documents[1]}
        selectedFolder={null}
      >
        <div>Editor content</div>
      </WorkspaceCenterShell>,
    );

    expect(screen.queryByRole("button", { name: "Welcome" })).toBeNull();
    expect(screen.getByRole("button", { name: "Engineering Runbook" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("creates an empty tab with the plus button and fills it with the next selected document", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([{ id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" }]),
    );
    window.localStorage.setItem("munjib:open-tabs-active:company-handbook", "tab-1");

    const { rerender } = renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Add tab" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
    expect(screen.getByRole("button", { name: "New tab" }).getAttribute("aria-current")).toBe("page");

    rerender(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={documents[1]}
        selectedFolder={null}
      >
        <div>Editor content</div>
      </WorkspaceCenterShell>,
    );

    expect(screen.getByRole("button", { name: "Welcome" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Engineering Runbook" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("disables forward navigation when there is no target document", () => {
    const { rerender } = renderShell(documents[0]);
    const backButton = screen.getByRole("button", { name: "Navigate back" }) as HTMLButtonElement;
    const forwardButton = screen.getByRole("button", { name: "Navigate forward" }) as HTMLButtonElement;

    expect(backButton.disabled).toBe(true);
    expect(forwardButton.disabled).toBe(true);

    rerender(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={documents[1]}
        selectedFolder={null}
      >
        <div>Editor content</div>
      </WorkspaceCenterShell>,
    );

    expect(backButton.disabled).toBe(false);
    expect(forwardButton.disabled).toBe(true);

    fireEvent.click(backButton);

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
    expect(forwardButton.disabled).toBe(false);

    fireEvent.click(forwardButton);

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-2");
  });

  it("keeps forward navigation disabled when the next history document is no longer readable", () => {
    const { rerender } = renderShell(documents[0]);

    rerender(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={documents[1]}
        selectedFolder={null}
      >
        <div>Editor content</div>
      </WorkspaceCenterShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Navigate back" }));

    rerender(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={[documents[0], documents[2]]}
        selectedDocument={documents[0]}
        selectedFolder={null}
      >
        <div>Editor content</div>
      </WorkspaceCenterShell>,
    );

    const forwardButton = screen.getByRole("button", { name: "Navigate forward" }) as HTMLButtonElement;
    expect(forwardButton.disabled).toBe(true);
    fireEvent.click(forwardButton);

    expect(router.push).not.toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-2");
  });

  it("does not write stale tabs when switching workspace storage keys", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([
        { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
        { id: "tab-2", documentId: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
      ]),
    );
    window.localStorage.setItem("munjib:open-tabs-active:company-handbook", "tab-1");
    window.localStorage.setItem(
      "munjib:open-tabs:team-handbook",
      JSON.stringify([{ id: "tab-3", documentId: "doc-3", title: "Operations Runbook", path: "/operations/runbook" }]),
    );
    window.localStorage.setItem("munjib:open-tabs-active:team-handbook", "tab-3");

    const { rerender } = renderShell(documents[0]);
    const setItem = vi.mocked(window.localStorage.setItem);
    const removeItem = vi.mocked(window.localStorage.removeItem);
    setItem.mockClear();
    removeItem.mockClear();

    rerender(
      <WorkspaceCenterShell
        workspaceSlug="team-handbook"
        documents={documents}
        selectedDocument={documents[2]}
        selectedFolder={null}
      >
        <div>Editor content</div>
      </WorkspaceCenterShell>,
    );

    const staleWrite = setItem.mock.calls.find(
      ([key, value]) =>
        key === "munjib:open-tabs:team-handbook" &&
        value ===
          JSON.stringify([
            { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
            { id: "tab-2", documentId: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
          ]),
    );

    expect(staleWrite).toBeUndefined();
    expect(removeItem).not.toHaveBeenCalledWith("munjib:open-tabs-active:team-handbook");
  });
});
