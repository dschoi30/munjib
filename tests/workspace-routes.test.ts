import { describe, expect, it } from "vitest";
import { workspaceDocumentHref, workspaceGraphHref } from "@/lib/workspace-routes";

describe("workspaceDocumentHref", () => {
  it("preserves the search query when linking to a document", () => {
    expect(
      workspaceDocumentHref({
        workspaceSlug: "company-handbook",
        documentId: "doc-1",
        searchQuery: "Backlinked Runbook",
      }),
    ).toBe("/workspaces/company-handbook?document=doc-1&q=Backlinked+Runbook");
  });

  it("omits empty search queries", () => {
    expect(
      workspaceDocumentHref({
        workspaceSlug: "company-handbook",
        documentId: "doc-1",
        searchQuery: "",
      }),
    ).toBe("/workspaces/company-handbook?document=doc-1");
  });
});

describe("workspaceGraphHref", () => {
  it("links to workspace graph mode without a selected document", () => {
    expect(
      workspaceGraphHref({
        workspaceSlug: "company-handbook",
      }),
    ).toBe("/workspaces/company-handbook?graph=1");
  });

  it("preserves a selected document as graph focus", () => {
    expect(
      workspaceGraphHref({
        workspaceSlug: "company-handbook",
        documentId: "doc-1",
      }),
    ).toBe("/workspaces/company-handbook?document=doc-1&graph=1");
  });
});
