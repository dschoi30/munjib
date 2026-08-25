import { describe, expect, it, vi } from "vitest";
import { loadTrialWorkspaceViewer } from "@/lib/workspaces/trial-viewer";

describe("anonymous Trial workspace viewer", () => {
  it("loads only the exact active demo workspace and excludes every explicitly protected document", async () => {
    const findWorkspace = vi.fn().mockResolvedValue({
      id: "workspace-demo-1",
      slug: "company-handbook",
      name: "Company Handbook",
      archivedAt: null,
      documents: [
        { id: "doc-open", title: "Welcome", contentMarkdown: "Hello", status: "ACTIVE" },
        { id: "doc-private", title: "Private", contentMarkdown: "Secret", status: "ACTIVE" },
      ],
    });
    const listExplicitDocumentIds = vi.fn().mockResolvedValue(["doc-private"]);

    const result = await loadTrialWorkspaceViewer(
      {
        kind: "anonymous-trial-demo",
        capabilityId: "anonymous-trial-v1",
        workspaceId: "workspace-demo-1",
        workspaceSlug: "company-handbook",
        access: "viewer-only",
        trialVisitorSubject: "opaque-subject",
      },
      "company-handbook",
      { findWorkspace, listExplicitDocumentIds },
    );

    expect(findWorkspace).toHaveBeenCalledWith({ id: "workspace-demo-1", slug: "company-handbook" });
    expect(result?.documents.map((document) => document.id)).toEqual(["doc-open"]);
    expect(JSON.stringify(result)).not.toContain("Secret");
  });

  it("fails closed before querying for a mismatched slug", async () => {
    const findWorkspace = vi.fn();
    const result = await loadTrialWorkspaceViewer(
      {
        kind: "anonymous-trial-demo",
        capabilityId: "anonymous-trial-v1",
        workspaceId: "workspace-demo-1",
        workspaceSlug: "company-handbook",
        access: "viewer-only",
        trialVisitorSubject: "opaque-subject",
      },
      "lookalike-workspace",
      { findWorkspace, listExplicitDocumentIds: vi.fn() },
    );

    expect(result).toBeNull();
    expect(findWorkspace).not.toHaveBeenCalled();
  });
});
