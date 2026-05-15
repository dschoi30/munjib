// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "@/components/document-list";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const baseProps = {
  workspaceSlug: "company-handbook",
  folders: [],
  documents: [
    {
      id: "doc-1",
      folderId: null,
      title: "Welcome",
      path: "/welcome",
      contentText: "Welcome body",
      canWrite: true,
    },
    {
      id: "doc-2",
      folderId: null,
      title: "Engineering Runbook",
      path: "/engineering-runbook",
      contentText: "Engineering body",
      canWrite: true,
    },
  ],
  canWrite: true,
  createAction: async () => {},
  createFolderAction: async () => {},
  renameFolderAction: async (formData: FormData) => ({
    folderId: String(formData.get("folderId")),
  }),
  archiveFolderAction: async (formData: FormData) => ({
    folderId: String(formData.get("folderId")),
  }),
  archiveDocumentAction: async (formData: FormData) => ({
    documentId: String(formData.get("documentId")),
  }),
  folderError: "",
  selectedFolderId: null,
  selectedDocumentId: "doc-1",
};

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();

  let store: Record<string, string> = {};

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => {
        store = {};
      },
      getItem: (key: string) => store[key] ?? null,
      removeItem: (key: string) => {
        delete store[key];
      },
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });
});

afterEach(() => {
  cleanup();
});

function renderList(props: Partial<Parameters<typeof DocumentList>[0]> = {}) {
  return render(<DocumentList {...baseProps} {...props} />);
}

describe("DocumentList", () => {
  it("shows the workspace title inline with icon-only create controls", () => {
    renderList();

    expect(screen.queryByText("Workspace")).toBeNull();
    expect(screen.getByRole("heading", { name: "Company Handbook" }).parentElement?.className).toContain("h-11");
    expect(screen.getByRole("button", { name: "New document" }).textContent).toBe("");
    expect(screen.getByRole("button", { name: "New folder" }).textContent).toBe("");
    expect(screen.queryByRole("combobox", { name: /template/i })).toBeNull();
  });

  it("opens search from the toolbar and replaces the document list with matching results", () => {
    renderList();

    expect(screen.queryByLabelText("Search documents")).toBeNull();
    expect(screen.queryByPlaceholderText("Search title or body")).toBeNull();
    expect(screen.queryByText("Search results")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "Engineering body" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Engineering Runbook/ })).toBeTruthy();
    expect(screen.queryByText("Recents")).toBeNull();
    expect(screen.queryByText("Documents")).toBeNull();
    expect(screen.queryByRole("link", { name: "Welcome" })).toBeNull();
  });

  it("opens search with Ctrl K", () => {
    renderList();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByLabelText("Search documents")).toBeTruthy();
  });

  it("opens favorites as a replacement view instead of an always-visible section", () => {
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({ documents: ["doc-2"], folders: [] }),
    );

    renderList();

    expect(screen.queryByText("Favorites")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    expect(screen.getByText("Favorites")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Engineering Runbook" })).toBeTruthy();
    expect(screen.queryByText("Recents")).toBeNull();
    expect(screen.queryByText("Documents")).toBeNull();
  });

  it("opens graph view from the toolbar with focus on the selected document", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(router.push).toHaveBeenCalledWith(
      "/workspaces/company-handbook?document=doc-1&graph=1",
    );
  });

  it("marks the graph toolbar button active in graph view", () => {
    renderList({ isGraphView: true });

    expect(screen.getByRole("button", { name: "Graph" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("returns to the document list from search and favorites with the Documents toolbar button", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByLabelText("Search documents")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getByText("Recents")).toBeTruthy();
    expect(screen.queryByLabelText("Search documents")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(screen.getByText("Favorites")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.queryByText("Favorites")).toBeNull();
  });

  it("returns to the document list from search and favorites with Escape", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByLabelText("Search documents")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Recents")).toBeTruthy();
    expect(screen.queryByLabelText("Search documents")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(screen.getByText("Favorites")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.queryByText("Favorites")).toBeNull();
  });

  it("shows tooltips for sidebar toolbar icons on hover", async () => {
    renderList();

    fireEvent.pointerMove(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("tooltip", { name: "Search" })).toBeTruthy();
  });

  it("uses original section label sizing and stronger selected row highlight", () => {
    renderList();

    const recentsLabel = screen.getByText("Recents");
    const documentsLabel = screen.getByText("Documents");
    expect(recentsLabel.className).toContain("text-[0.68rem]");
    expect(recentsLabel.className).toContain("uppercase");
    expect(recentsLabel.className).toContain("tracking-wide");
    expect(documentsLabel.className).toContain("text-[0.68rem]");
    expect(documentsLabel.className).toContain("uppercase");
    expect(documentsLabel.className).toContain("tracking-wide");

    const selectedRow = screen.getAllByRole("link", { name: "Welcome" })[0].parentElement;
    expect(selectedRow?.className).toContain("bg-slate-200");
  });
});
