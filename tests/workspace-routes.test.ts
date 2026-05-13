import { describe, expect, it } from "vitest";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

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
