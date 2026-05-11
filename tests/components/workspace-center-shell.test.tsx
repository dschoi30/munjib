// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCenterShell } from "@/components/workspace-center-shell";

const router = vi.hoisted(() => ({
  push: vi.fn(),
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
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  vi.spyOn(window.history, "forward").mockImplementation(() => {});

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: (key: string) => {
        delete store[key];
      },
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

  it("renders stored readable tabs and switches by router push", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([documents[0], documents[1]]),
    );

    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Engineering Runbook" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-2");
  });

  it("closes the active tab and routes to the next tab", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([documents[0], documents[1]]),
    );

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
      JSON.stringify([documents[0], documents[1]]),
    );

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

  it("uses browser history for toolbar navigation", () => {
    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Navigate back" }));
    fireEvent.click(screen.getByRole("button", { name: "Navigate forward" }));

    expect(window.history.back).toHaveBeenCalledOnce();
    expect(window.history.forward).toHaveBeenCalledOnce();
  });

  it("does not write stale tabs when switching workspace storage keys", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([documents[0], documents[1]]),
    );
    window.localStorage.setItem("munjib:open-tabs:team-handbook", JSON.stringify([documents[2]]));

    const { rerender } = renderShell(documents[0]);
    const setItem = vi.mocked(window.localStorage.setItem);
    setItem.mockClear();

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
        key === "munjib:open-tabs:team-handbook" && value === JSON.stringify([documents[0], documents[1]]),
    );

    expect(staleWrite).toBeUndefined();
  });
});
