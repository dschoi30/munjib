import { describe, expect, it } from "vitest";
import {
  addDocumentTab,
  addEmptyDocumentTab,
  closeDocumentTab,
  createDocumentTab,
  formatWorkspacePath,
  parseStoredDocumentTabs,
  reconcileDocumentTabs,
  serializeDocumentTabs,
  type DocumentTab,
  type DocumentTabDocument,
} from "@/lib/document-tabs";

const readable: DocumentTabDocument[] = [
  { id: "doc-1", title: "Welcome", path: "/welcome" },
  { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
  { id: "doc-3", title: "Operations Runbook", path: "/operations/runbook" },
];

const storedTabs: DocumentTab[] = [
  createDocumentTab(readable[0], "tab-1"),
  createDocumentTab(readable[1], "tab-2"),
];

describe("parseStoredDocumentTabs", () => {
  it("returns an empty list for missing or corrupted values", () => {
    expect(parseStoredDocumentTabs(null)).toEqual([]);
    expect(parseStoredDocumentTabs("{broken")).toEqual([]);
    expect(parseStoredDocumentTabs(JSON.stringify([{ id: 1, title: "Bad", path: "/" }]))).toEqual(
      [],
    );
  });

  it("returns an empty list for non-array JSON", () => {
    expect(parseStoredDocumentTabs(JSON.stringify({ id: "doc-1", title: "Welcome", path: "/" }))).toEqual(
      [],
    );
  });

  it("keeps valid tab records and migrates legacy document-shaped tabs", () => {
    expect(
      parseStoredDocumentTabs(
        JSON.stringify([
          { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
          { id: "", documentId: "doc-bad", title: "Bad", path: "/bad" },
          { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
        ]),
      ),
    ).toEqual([
      { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
      {
        id: "doc-2",
        documentId: "doc-2",
        title: "Engineering Runbook",
        path: "/engineering/runbook",
      },
    ]);
  });
});

describe("reconcileDocumentTabs", () => {
  it("creates an active tab for the first selected document", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [],
      readableDocuments: readable,
      selectedDocument: readable[0],
      activeTabId: null,
    });

    expect(result.tabs).toEqual([createDocumentTab(readable[0], "tab:doc-1")]);
    expect(result.activeTabId).toBe("tab:doc-1");
  });

  it("replaces the active tab when another document is selected", () => {
    const result = reconcileDocumentTabs({
      storedTabs,
      readableDocuments: readable,
      selectedDocument: readable[2],
      activeTabId: "tab-1",
    });

    expect(result.tabs).toEqual([createDocumentTab(readable[2], "tab-1"), storedTabs[1]]);
    expect(result.activeTabId).toBe("tab-1");
  });

  it("fills a newly created empty tab with the selected document", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [...storedTabs, { id: "tab-empty", documentId: null, title: "New tab", path: "/" }],
      readableDocuments: readable,
      selectedDocument: readable[2],
      activeTabId: "tab-empty",
    });

    expect(result.tabs.at(-1)).toEqual(createDocumentTab(readable[2], "tab-empty"));
    expect(result.activeTabId).toBe("tab-empty");
  });

  it("prunes tabs that are no longer readable and refreshes metadata", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [
        { id: "tab-1", documentId: "doc-1", title: "Old title", path: "/old" },
        { id: "tab-missing", documentId: "missing", title: "Missing", path: "/missing" },
      ],
      readableDocuments: readable,
      selectedDocument: null,
      activeTabId: "tab-1",
    });

    expect(result.tabs).toEqual([createDocumentTab(readable[0], "tab-1")]);
  });
});

describe("add and close document tabs", () => {
  it("adds an empty tab and makes it active", () => {
    const result = addEmptyDocumentTab(storedTabs);

    expect(result.tabs).toHaveLength(3);
    expect(result.tabs[2]).toMatchObject({ documentId: null, title: "New tab", path: "/" });
    expect(result.activeTabId).toBe(result.tabs[2]?.id);
  });

  it("adds a document tab for explicit Open in new tab", () => {
    const result = addDocumentTab(storedTabs, readable[2]);

    expect(result.tabs.at(-1)).toEqual({
      id: result.activeTabId,
      documentId: "doc-3",
      title: "Operations Runbook",
      path: "/operations/runbook",
    });
  });

  it("removes an inactive tab without changing the active target", () => {
    expect(
      closeDocumentTab({
        tabs: storedTabs,
        closedTabId: "tab-1",
        activeTabId: "tab-2",
      }),
    ).toEqual({
      tabs: [storedTabs[1]],
      nextActiveTabId: "tab-2",
      nextDocumentId: "doc-2",
      closedWasActive: false,
    });
  });

  it("selects the right tab, then left tab, then root when closing the active tab", () => {
    expect(
      closeDocumentTab({
        tabs: [...storedTabs, createDocumentTab(readable[2], "tab-3")],
        closedTabId: "tab-2",
        activeTabId: "tab-2",
      }),
    ).toMatchObject({ nextActiveTabId: "tab-3", nextDocumentId: "doc-3", closedWasActive: true });

    expect(
      closeDocumentTab({
        tabs: storedTabs,
        closedTabId: "tab-2",
        activeTabId: "tab-2",
      }),
    ).toMatchObject({ nextActiveTabId: "tab-1", nextDocumentId: "doc-1", closedWasActive: true });

    expect(
      closeDocumentTab({
        tabs: [storedTabs[0]],
        closedTabId: "tab-1",
        activeTabId: "tab-1",
      }),
    ).toMatchObject({ nextActiveTabId: null, nextDocumentId: null, closedWasActive: true });
  });
});

describe("document tab storage and path display", () => {
  it("serializes tabs as stable JSON", () => {
    expect(serializeDocumentTabs([storedTabs[0]])).toBe(
      JSON.stringify([{ id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" }]),
    );
  });

  it("formats slash paths for toolbar display", () => {
    expect(formatWorkspacePath("/operations/runbook")).toBe("operations / runbook");
    expect(formatWorkspacePath("/")).toBe("/");
    expect(formatWorkspacePath("")).toBe("/");
  });
});
