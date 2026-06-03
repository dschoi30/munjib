// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell, useTagSearch } from "@/components/app-shell";
import { DocumentList } from "@/components/document-list";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

const folderFixtures = [
  {
    id: "folder-engineering",
    parentFolderId: null,
    name: "Engineering",
    path: "/engineering",
  },
  {
    id: "folder-runbooks",
    parentFolderId: "folder-engineering",
    name: "Runbooks",
    path: "/engineering/runbooks",
  },
];

const baseProps = {
  workspaceSlug: "company-handbook",
  folders: folderFixtures,
  documents: [
    {
      id: "doc-1",
      folderId: null,
      title: "Welcome",
      path: "/welcome",
      contentText: "Welcome body",
      tagNames: ["welcome", "langchain"],
      canWrite: true,
    },
    {
      id: "doc-2",
      folderId: null,
      title: "Engineering Runbook",
      path: "/engineering-runbook",
      contentText: "Engineering body",
      tagNames: ["engineering"],
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
  toastMock.mockReset();

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

function TagSearchRequester({ tag }: { tag: string }) {
  const tagSearch = useTagSearch();

  return (
    <button type="button" onClick={() => tagSearch?.requestTagSearch(tag)}>
      Search tag
    </button>
  );
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
    expect(screen.getByRole("button", { name: /Import destination: \// }).textContent).toBe(
      "/",
    );
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

  it("orders folders before documents and sorts each group by title ascending", () => {
    renderList({
      folders: [
        { id: "folder-alpha", parentFolderId: null, name: "Alpha", path: "/alpha" },
        { id: "folder-zulu", parentFolderId: null, name: "Zulu", path: "/zulu" },
      ],
      documents: [
        {
          id: "doc-alpha",
          folderId: null,
          title: "Alpha Doc",
          path: "/alpha-doc",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
        {
          id: "doc-zulu",
          folderId: null,
          title: "Zulu Doc",
          path: "/zulu-doc",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    const rowNames = Array.from(
      allDocumentsNav.querySelectorAll("button[aria-expanded]:not([data-row-action-menu]), a[href]"),
    ).map((element) => element.textContent?.trim());

    expect(rowNames).toEqual(["Alpha", "Zulu", "Alpha Doc", "Zulu Doc"]);
  });

  it("keeps top-level create controls scoped to the workspace root", () => {
    renderList({ selectedFolderId: "folder-engineering" });

    const newDocumentButton = screen.getByRole("button", { name: "New document" });
    const newFolderButton = screen.getByRole("button", { name: "New folder" });
    const documentForm = newDocumentButton.closest("form");
    const folderForm = newFolderButton.closest("form");

    expect(
      documentForm?.querySelector<HTMLInputElement>('input[name="folderId"]')?.value,
    ).toBe("");
    expect(
      folderForm?.querySelector<HTMLInputElement>('input[name="parentFolderId"]')?.value,
    ).toBe("");
  });

  it("keeps recents populated when a recent document is favorited", async () => {
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({ documents: ["doc-1"], folders: [] }),
    );

    renderList();

    const recentsSection = screen.getByText("Recents").closest("section");
    expect(recentsSection).toBeTruthy();
    await waitFor(() => {
      expect(
        within(recentsSection as HTMLElement).getByRole("link", { name: "Welcome" }),
      ).toBeTruthy();
    });
  });

  it("moves newly selected documents into recents", async () => {
    const documents = Array.from({ length: 6 }, (_, index) => ({
      id: `doc-${index + 1}`,
      folderId: null,
      title: `Document ${index + 1}`,
      path: `/document-${index + 1}`,
      contentText: "",
      tagNames: [],
      canWrite: true,
    }));
    const { rerender } = renderList({ documents, selectedDocumentId: "doc-1" });

    rerender(
      <DocumentList {...baseProps} documents={documents} selectedDocumentId="doc-6" />,
    );

    const recentsSection = screen.getByText("Recents").closest("section");
    expect(recentsSection).toBeTruthy();
    await waitFor(() => {
      expect(
        within(recentsSection as HTMLElement)
          .getAllByRole("link")
          .map((link) => link.textContent?.trim()),
      ).toEqual(["Document 6", "Document 1", "Document 2", "Document 3", "Document 4"]);
    });
  });

  it("shows duplicate document titles without path context in visible rows", () => {
    renderList({
      documents: [
        {
          id: "doc-root-runbook",
          folderId: null,
          title: "Runbook",
          path: "/runbook",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
        {
          id: "doc-folder-runbook",
          folderId: null,
          title: "Runbook",
          path: "/operations/runbook",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    expect(screen.getAllByRole("link", { name: "Runbook" })).toHaveLength(4);
    expect(screen.queryByText("Runbook · /operations/runbook")).toBeNull();
    expect(
      screen.getAllByRole("button", {
        name: "Open actions for Runbook · /operations/runbook",
      }).length,
    ).toBeGreaterThan(0);
  });

  it("shows a visible fallback label for empty document titles", () => {
    renderList({
      documents: [
        {
          id: "doc-empty-title",
          folderId: null,
          title: "",
          path: "/untitled",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    expect(screen.getAllByRole("link", { name: "Untitled" }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", {
        name: "Open actions for Untitled",
      }).length,
    ).toBeGreaterThan(0);
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

  it("opens a markdown import progress panel and imports files one at a time", async () => {
    const importMarkdownAction = vi
      .fn()
      .mockResolvedValueOnce({
        documentIds: ["doc-imported"],
        imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
        failed: [],
      })
      .mockResolvedValueOnce({
        documentIds: ["doc-second"],
        imported: [{ fileName: "second.markdown", documentId: "doc-second" }],
        failed: [],
      });
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const importedFile = new File(["# Imported"], "imported.md", { type: "text/markdown" });
    const secondFile = new File(["# Second"], "second.markdown", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [importedFile, secondFile],
      },
    });

    expect(screen.queryByRole("table", { name: "Markdown import files" })).toBeNull();
    expect(screen.getByText("2 files selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    expect(screen.getByRole("region", { name: "Markdown import progress" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Importing 1 / 2");
    expect(screen.getByRole("table", { name: "Markdown import files" })).toBeTruthy();
    expect(screen.getByText("imported.md").closest("tr")?.textContent).toContain("Importing");
    expect(screen.getByText("second.markdown").closest("tr")?.textContent).toContain("Queued");

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledTimes(2);
    });
    const firstFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
    const secondFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[1][0];
    expect(firstFormData.getAll("markdownFiles")).toEqual([importedFile]);
    expect(secondFormData.getAll("markdownFiles")).toEqual([secondFile]);
    expect(firstFormData.get("folderId")).toBeNull();
    expect(secondFormData.get("folderId")).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Imported 2 Markdown file(s).");
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Markdown import progress" })).toBeTruthy();
    expect(screen.getAllByText("Imported")).toHaveLength(2);
  });

  it("opens the destination picker and imports markdown files into the selected folder", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    }));
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Import destination: \// }));

    expect(
      screen.getByRole("tree", { name: "Import destination folders" }),
    ).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: "/" })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: "/engineering" })).toBeTruthy();

    fireEvent.click(screen.getByRole("treeitem", { name: "/engineering/runbooks" }));

    expect(screen.queryByRole("tree", { name: "Import destination folders" })).toBeNull();
    const selectedDestinationButton = screen.getByRole("button", {
      name: /Import destination: \/engineering\/runbooks/,
    });
    expect(selectedDestinationButton.textContent).toBe("/engineering/runbooks");

    const importedFile = new File(["# Imported"], "imported.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [importedFile],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.getAll("markdownFiles")).toEqual([importedFile]);
    expect(submittedFormData.get("folderId")).toBe("folder-runbooks");
    expect(
      await screen.findByRole("region", { name: "Markdown import progress" }),
    ).toBeTruthy();
    expect(await screen.findByText("Destination: /engineering/runbooks")).toBeTruthy();
  });

  it("omits folderId when importing markdown files to the default root destination", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "root.md", documentId: "doc-imported" }],
      failed: [],
    }));
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    expect(screen.getByRole("button", { name: /Import destination: \// }).textContent).toBe(
      "/",
    );

    const importedFile = new File(["# Root"], "root.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [importedFile],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.getAll("markdownFiles")).toEqual([importedFile]);
    expect(submittedFormData.get("folderId")).toBeNull();
    expect(
      await screen.findByRole("region", { name: "Markdown import progress" }),
    ).toBeTruthy();
    expect(await screen.findByText("Destination: /")).toBeTruthy();
  });

  it("continues importing queued markdown files after one file fails", async () => {
    const importMarkdownAction = vi
      .fn()
      .mockResolvedValueOnce({
        documentIds: ["doc-imported"],
        imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
        failed: [],
      })
      .mockResolvedValueOnce({
        documentIds: [],
        imported: [],
        failed: [{ fileName: "failed.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
      })
      .mockResolvedValueOnce({
        documentIds: ["doc-later"],
        imported: [{ fileName: "later.md", documentId: "doc-later" }],
        failed: [],
      });
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [
          new File(["# Imported"], "imported.md", { type: "text/markdown" }),
          new File(["nope"], "failed.md", { type: "text/markdown" }),
          new File(["# Later"], "later.md", { type: "text/markdown" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledTimes(3);
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Imported 2 file(s). 1 file(s) failed.",
      );
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("imported.md").closest("tr")?.textContent).toContain("Imported");
    expect(screen.getByText("failed.md").closest("tr")?.textContent).toContain("Failed");
    expect(screen.getByText("later.md").closest("tr")?.textContent).toContain("Imported");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("continues importing queued markdown files after a request throws", async () => {
    const importMarkdownAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({
        documentIds: ["doc-later"],
        imported: [{ fileName: "later.md", documentId: "doc-later" }],
        failed: [],
      });
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [
          new File(["# Throws"], "throws.md", { type: "text/markdown" }),
          new File(["# Later"], "later.md", { type: "text/markdown" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Imported 1 file(s). 1 file(s) failed.",
      );
    });
    expect(screen.getByText("throws.md").closest("tr")?.textContent).toContain("Failed");
    expect(screen.getByText("later.md").closest("tr")?.textContent).toContain("Imported");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps duplicate markdown filenames as independent progress rows", async () => {
    const importMarkdownAction = vi
      .fn()
      .mockResolvedValueOnce({
        documentIds: ["doc-one"],
        imported: [{ fileName: "duplicate.md", documentId: "doc-one" }],
        failed: [],
      })
      .mockResolvedValueOnce({
        documentIds: [],
        imported: [],
        failed: [{ fileName: "duplicate.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
      });
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
      .map((fileNameCell) => fileNameCell.closest("tr")?.textContent ?? "");

    expect(duplicateRows).toHaveLength(2);
    expect(duplicateRows.filter((rowText) => rowText.includes("Imported"))).toHaveLength(1);
    expect(duplicateRows.filter((rowText) => rowText.includes("Failed"))).toHaveLength(1);
  });

  it("uses an icon-only x button to close the completed import progress panel", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    }));
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [new File(["# Imported"], "imported.md", { type: "text/markdown" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Imported 1 Markdown file(s).");
    });

    const closeButton = screen.getByRole("button", { name: "Close import progress" });
    fireEvent.click(closeButton);

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Markdown import progress" })).toBeNull();
  });

  it("keeps settings open during active markdown import and allows close after completion", async () => {
    let resolveImport: (result: Awaited<ReturnType<typeof baseProps.importMarkdownAction>>) => void =
      () => {};
    const importPromise = new Promise<Awaited<ReturnType<typeof baseProps.importMarkdownAction>>>(
      (resolve) => {
        resolveImport = resolve;
      },
    );
    const importMarkdownAction = vi.fn(() => importPromise);
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [new File(["# Slow"], "slow.md", { type: "text/markdown" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("region", { name: "Markdown import progress" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close settings" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.click(screen.getByTestId("workspace-settings-backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Markdown import progress" })).toBeTruthy();

    await act(async () => {
      resolveImport({
        documentIds: ["doc-slow"],
        imported: [{ fileName: "slow.md", documentId: "doc-slow" }],
        failed: [],
      });
      await importPromise;
    });

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Imported 1 Markdown file(s).");
      expect(screen.getByRole("button", { name: "Close settings" })).toHaveProperty(
        "disabled",
        false,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(screen.queryByRole("dialog", { name: "Workspace settings" })).toBeNull();
  });

  it("does not refresh the workspace when every markdown import row fails", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: [],
      imported: [],
      failed: [{ fileName: "failed.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
    }));
    renderList({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [new File(["nope"], "failed.md", { type: "text/markdown" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Import failed for 1 file(s).");
    });
    expect(screen.getByText("failed.md").closest("tr")?.textContent).toContain("Failed");
    expect(router.refresh).not.toHaveBeenCalled();
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

  it("opens sidebar search with a literal tag query from AppShell tag search requests", () => {
    render(
      <AppShell
        left={<DocumentList {...baseProps} />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#LangChain",
    );
  });

  it("does not replay an old tag search request after later document navigation", () => {
    const { rerender } = render(
      <AppShell
        left={<DocumentList {...baseProps} selectedDocumentId="doc-1" />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));
    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#LangChain",
    );

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.queryByLabelText("Search documents")).toBeNull();

    rerender(
      <AppShell
        left={<DocumentList {...baseProps} selectedDocumentId="doc-2" />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div />}
      />,
    );

    expect(screen.queryByLabelText("Search documents")).toBeNull();
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("opens tag search from graph view without leaving graph mode", () => {
    render(
      <AppShell
        left={<DocumentList {...baseProps} isGraphView selectedDocumentId="doc-1" />}
        center={<TagSearchRequester tag="Design" />}
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#Design",
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("filters search results with exact case-insensitive tag queries", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "tag:#LANGCHAIN" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Welcome/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Engineering Runbook/ })).toBeNull();
  });

  it("filters tag queries without a leading hash", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "tag:langchain" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Welcome/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Engineering Runbook/ })).toBeNull();
  });

  it("filters search results with Korean tag queries", () => {
    renderList({
      documents: [
        { ...baseProps.documents[0], tagNames: ["로드맵"] },
        { ...baseProps.documents[1], tagNames: ["engineering"] },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "tag:#로드맵" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Welcome/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Engineering Runbook/ })).toBeNull();
  });

  it("does not partially match tag queries", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "tag:#lang" },
    });

    expect(screen.getByText("0 results")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Welcome/ })).toBeNull();
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

  it("moves folder-scoped creation into the folder actions menu", () => {
    renderList();

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });

    expect(
      within(allDocumentsNav).queryByRole("button", { name: /New document in Engineering/ }),
    ).toBeNull();

    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );

    expect(screen.getByRole("menuitem", { name: "Add folder" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Add document" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Move to trash" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Add to favorites" })).toBeTruthy();
  });

  it("adds a child folder from the folder actions menu without direct form redirect", async () => {
    const createFolderAction = vi.fn(async () => ({ folderId: "folder-created" }));
    renderList({ createFolderAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add folder" }));

    await waitFor(() => {
      expect(createFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (createFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("parentFolderId")).toBe("folder-engineering");
    expect(submittedFormData.get("redirect")).toBe("false");
    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?folder=folder-created");
  });

  it("guards folder menu creation against repeated clicks while pending", async () => {
    let resolveCreateFolder: (result: { folderId: string }) => void = () => {};
    const createFolderAction = vi.fn(
      () =>
        new Promise<{ folderId: string }>((resolve) => {
          resolveCreateFolder = resolve;
        }),
    );
    renderList({ createFolderAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    const addFolderMenuItem = screen.getByRole("menuitem", { name: "Add folder" });

    fireEvent.click(addFolderMenuItem);
    fireEvent.click(addFolderMenuItem);

    expect(createFolderAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem", { name: "Add folder" })).toBeNull();

    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    expect(screen.getByRole("menuitem", { name: "Add folder" })).toHaveProperty(
      "disabled",
      true,
    );

    resolveCreateFolder({ folderId: "folder-created" });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        "/workspaces/company-handbook?folder=folder-created",
      );
    });
  });

  it("adds a document from the folder actions menu without direct form redirect", async () => {
    const createAction = vi.fn(async () => ({ documentId: "doc-created" }));
    renderList({ createAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add document" }));

    await waitFor(() => {
      expect(createAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (createAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("folderId")).toBe("folder-engineering");
    expect(submittedFormData.get("redirect")).toBe("false");
    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-created");
  });

  it("shows feedback when folder menu creation fails", async () => {
    const createFolderAction = vi.fn(async () => {
      throw new Error("create failed");
    });
    renderList({ createFolderAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add folder" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Could not create the item. Try again.",
        expect.objectContaining({ id: "folder-create-error" }),
      );
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows feedback when folder menu document creation fails", async () => {
    const createAction = vi.fn(async () => {
      throw new Error("create failed");
    });
    renderList({ createAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add document" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Could not create the item. Try again.",
        expect.objectContaining({ id: "folder-create-error" }),
      );
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
