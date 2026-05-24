// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  importMarkdownAction: async () => ({
    documentIds: ["doc-imported"],
    imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
    failed: [],
  }),
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
    expect(screen.getByRole("button", { name: "Workspace settings" }).parentElement?.className).toContain("ml-auto");
    expect(screen.getByRole("button", { name: "New document" }).textContent).toBe("");
    expect(screen.getByRole("button", { name: "New folder" }).textContent).toBe("");
    expect(screen.queryByRole("combobox", { name: /template/i })).toBeNull();
  });

  it("spaces the toolbar groups apart and places graph second", () => {
    renderList();

    const toolbar = screen.getByTestId("document-create-toolbar");
    expect(toolbar.className).toContain("justify-between");

    const buttonNames = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim())
      .filter(Boolean);
    const documentsIndex = buttonNames.indexOf("Documents");

    expect(documentsIndex).toBeGreaterThan(-1);
    expect(buttonNames[documentsIndex + 1]).toBe("Graph");
  });

  it("opens the workspace settings panel with import selected by default", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("heading", { name: "Import your contents" })).toBeTruthy();
    const fileInput = screen.getByLabelText("Markdown files");
    expect(fileInput.getAttribute("accept")).toBe(
      ".md,.markdown,text/markdown,text/x-markdown",
    );
    expect(fileInput).toHaveProperty("multiple", true);
    expect(fileInput.className).toContain("sr-only");
    expect(screen.getByRole("button", { name: "Import Markdown" })).toBeTruthy();
  });

  it("keeps the document list visible behind the workspace settings dialog", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.getByText("Recents")).toBeTruthy();
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Welcome" }).length).toBeGreaterThan(0);
  });

  it("closes the workspace settings panel", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("closes the workspace settings panel from the backdrop without closing on dialog clicks", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(screen.getByRole("dialog", { name: "Workspace settings" }));

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("workspace-settings-backdrop"));

    expect(screen.queryByRole("dialog", { name: "Workspace settings" })).toBeNull();
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("disables markdown import when the workspace is read-only", () => {
    renderList({ canWrite: false });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));

    expect(screen.getByRole("button", { name: "Import Markdown" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByLabelText("Markdown files")).toHaveProperty("disabled", true);
  });

  it("imports selected markdown files without navigation and refreshes the workspace", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported", "doc-second"],
      imported: [
        { fileName: "imported.md", documentId: "doc-imported" },
        { fileName: "second.markdown", documentId: "doc-second" },
      ],
      failed: [],
    }));
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const fileInput = screen.getByLabelText("Markdown files") as HTMLInputElement;
    const importedFile = new File(["# Imported"], "imported.md", { type: "text/markdown" });
    const secondFile = new File(["# Second"], "second.markdown", { type: "text/markdown" });
    fireEvent.change(fileInput, {
      target: {
        files: [importedFile, secondFile],
      },
    });

    expect(screen.getByRole("table", { name: "Selected Markdown files" })).toBeTruthy();
    expect(screen.getByText("imported.md")).toBeTruthy();
    expect(screen.getByText("second.markdown")).toBeTruthy();
    expect(screen.getAllByText("Ready")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    expect(screen.getByRole("status").textContent).toBe("Importing 2 file(s)...");

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = importMarkdownAction.mock.calls[0][0] as FormData;
    expect(submittedFormData.getAll("markdownFiles")).toEqual([importedFile, secondFile]);
    expect(submittedFormData.get("folderId")).toBeNull();

    await waitFor(() => {
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Imported 2 Markdown file(s).");
    expect(screen.getAllByText("Imported")).toHaveLength(2);
  });

  it("shows partial markdown import failures in the settings panel", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [{ fileName: "failed.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
    }));
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [
          new File(["# Imported"], "imported.md", { type: "text/markdown" }),
          new File(["nope"], "failed.md", { type: "text/markdown" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Imported 1 file(s). 1 file(s) failed.",
      );
    });
    expect(screen.getByText("imported.md").parentElement?.textContent).toContain("Imported");
    expect(screen.getByText("failed.md").parentElement?.textContent).toContain("Failed");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("maps mixed duplicate markdown import results to one row per result", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-one"],
      imported: [{ fileName: "duplicate.md", documentId: "doc-one" }],
      failed: [{ fileName: "duplicate.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
    }));
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [
          new File(["# Imported"], "duplicate.md", { type: "text/markdown" }),
          new File(["nope"], "duplicate.md", { type: "text/markdown" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Imported 1 file(s). 1 file(s) failed.",
      );
    });

    const duplicateRows = screen
      .getAllByText("duplicate.md")
      .map((fileNameCell) => fileNameCell.parentElement?.textContent ?? "");

    expect(duplicateRows).toHaveLength(2);
    expect(duplicateRows.filter((rowText) => rowText.includes("Imported"))).toHaveLength(1);
    expect(duplicateRows.filter((rowText) => rowText.includes("Failed"))).toHaveLength(1);
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

  it("clears graph route when opening documents from graph view", () => {
    renderList({ isGraphView: true });

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("clears graph route and opens search from graph view", () => {
    renderList({ isGraphView: true });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
    expect(screen.getByLabelText("Search documents")).toBeTruthy();
  });

  it("clears graph route and opens favorites from graph view", () => {
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({ documents: ["doc-2"], folders: [] }),
    );

    renderList({ isGraphView: true });

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
    expect(screen.getByText("Favorites")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Engineering Runbook" })).toBeTruthy();
  });

  it("clears graph route to workspace root when no document is selected", () => {
    renderList({ isGraphView: true, selectedDocumentId: null });

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
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
