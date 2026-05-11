import { describe, expect, it } from "vitest";
import {
  closeDocumentTab,
  formatWorkspacePath,
  parseStoredDocumentTabs,
  reconcileDocumentTabs,
  serializeDocumentTabs,
  type DocumentTab,
} from "@/lib/document-tabs";

const readable: DocumentTab[] = [
  { id: "doc-1", title: "Welcome", path: "/welcome" },
  { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
  { id: "doc-3", title: "Operations Runbook", path: "/operations/runbook" },
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

  it("keeps only valid tab records", () => {
    expect(
      parseStoredDocumentTabs(
        JSON.stringify([
          { id: "doc-1", title: "Welcome", path: "/welcome" },
          { id: "", title: "Bad", path: "/bad" },
          { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
        ]),
      ),
    ).toEqual([
      { id: "doc-1", title: "Welcome", path: "/welcome" },
      { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
    ]);
  });
});

describe("reconcileDocumentTabs", () => {
  it("upserts the selected document without duplicates", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [{ id: "doc-1", title: "Old title", path: "/old" }],
      readableDocuments: readable,
      selectedDocument: readable[0],
    });

    expect(result).toEqual([{ id: "doc-1", title: "Welcome", path: "/welcome" }]);
  });

  it("prunes tabs that are no longer readable", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [
        { id: "doc-1", title: "Welcome", path: "/welcome" },
        { id: "missing", title: "Missing", path: "/missing" },
      ],
      readableDocuments: readable,
      selectedDocument: null,
    });

    expect(result).toEqual([{ id: "doc-1", title: "Welcome", path: "/welcome" }]);
  });

  it("dedupes stored tabs and refreshes metadata from readable documents", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [
        { id: "doc-1", title: "Old title", path: "/old" },
        { id: "doc-1", title: "Older title", path: "/older" },
        { id: "doc-2", title: "Stale title", path: "/stale" },
      ],
      readableDocuments: readable,
      selectedDocument: null,
    });

    expect(result).toEqual([
      { id: "doc-1", title: "Welcome", path: "/welcome" },
      { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
    ]);
  });

  it("appends a newly selected document to existing tabs", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [{ id: "doc-1", title: "Welcome", path: "/welcome" }],
      readableDocuments: readable,
      selectedDocument: readable[1],
    });

    expect(result.map((tab) => tab.id)).toEqual(["doc-1", "doc-2"]);
  });
});

describe("closeDocumentTab", () => {
  it("removes an inactive tab without changing the active target", () => {
    expect(
      closeDocumentTab({
        tabs: readable,
        closedTabId: "doc-1",
        activeDocumentId: "doc-2",
      }),
    ).toEqual({
      tabs: [readable[1], readable[2]],
      nextDocumentId: "doc-2",
    });
  });

  it("selects the right tab, then left tab, then root when closing the active tab", () => {
    expect(
      closeDocumentTab({
        tabs: readable,
        closedTabId: "doc-2",
        activeDocumentId: "doc-2",
      }).nextDocumentId,
    ).toBe("doc-3");

    expect(
      closeDocumentTab({
        tabs: readable.slice(0, 2),
        closedTabId: "doc-2",
        activeDocumentId: "doc-2",
      }).nextDocumentId,
    ).toBe("doc-1");

    expect(
      closeDocumentTab({
        tabs: [readable[0]],
        closedTabId: "doc-1",
        activeDocumentId: "doc-1",
      }).nextDocumentId,
    ).toBeNull();
  });
});

describe("document tab storage and path display", () => {
  it("serializes tabs as stable JSON", () => {
    expect(serializeDocumentTabs([readable[0]])).toBe(
      JSON.stringify([{ id: "doc-1", title: "Welcome", path: "/welcome" }]),
    );
  });

  it("formats slash paths for toolbar display", () => {
    expect(formatWorkspacePath("/operations/runbook")).toBe("operations / runbook");
    expect(formatWorkspacePath("/")).toBe("/");
    expect(formatWorkspacePath("")).toBe("/");
  });
});
