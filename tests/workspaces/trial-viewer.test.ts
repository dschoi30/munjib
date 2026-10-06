import { describe, expect, it, vi } from "vitest";
import { loadTrialWorkspaceViewer } from "@/lib/workspaces/trial-viewer";

describe("anonymous Trial workspace viewer", () => {
  it("loads only the exact active demo workspace and excludes every explicitly protected document", async () => {
    const findWorkspace = vi.fn().mockResolvedValue({
      id: "workspace-demo-1",
      slug: "company-handbook",
      name: "Company Handbook",
      archivedAt: null,
      folders: [{ id: "folder-1", parentFolderId: null, name: "Guides", path: "/guides", status: "ACTIVE" }, {id:"private-folder",parentFolderId:null,name:"Secret folder",path:"/secret"}],
      documents: [
        { id: "doc-open", folderId:"folder-1", title: "Welcome", contentMarkdown: "Hello", status: "ACTIVE" },
        { id: "doc-private", folderId:"private-folder", title: "Private", contentMarkdown: "Secret", status: "ACTIVE" },
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
      { findWorkspace, listExplicitDocumentIds, listDocumentLinks: vi.fn().mockResolvedValue([
        {id:"safe",sourceDocumentId:"doc-open",targetDocumentId:null,targetTitleRaw:"Missing",alias:null,isBroken:true,isAmbiguous:false},
        {id:"hidden-outgoing",sourceDocumentId:"doc-open",targetDocumentId:"doc-private",targetTitleRaw:"Private resolved title",alias:null,isBroken:false,isAmbiguous:false},
        {id:"hidden-backlink",sourceDocumentId:"doc-private",targetDocumentId:"doc-open",targetTitleRaw:"Welcome",alias:null,isBroken:false,isAmbiguous:false},
      ]) },
    );

    expect(findWorkspace).toHaveBeenCalledWith({ id: "workspace-demo-1", slug: "company-handbook" });
    expect(result?.documents.map((document) => document.id)).toEqual(["doc-open"]);
    expect(JSON.stringify(result)).not.toContain("Secret");
    expect(result?.links.map(l => l.id)).toEqual(["safe"]);
    expect(JSON.stringify(result)).not.toContain("Private resolved title");
    expect(result?.folders).toEqual([{ id: "folder-1", parentFolderId: null, name: "Guides", path: "/guides" }]);
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
      { findWorkspace, listExplicitDocumentIds: vi.fn(), listDocumentLinks: vi.fn() },
    );

    expect(result).toBeNull();
    expect(findWorkspace).not.toHaveBeenCalled();
  });
});
