import { describe, expect, it } from "vitest";
import {
  countFolderChildren,
  documentActionLabel,
  documentDisplayLabel,
  treeDepth,
} from "@/lib/workspace-tree";

describe("workspace tree helpers", () => {
  it("computes folder/document depth from normalized paths", () => {
    expect(treeDepth("/")).toBe(0);
    expect(treeDepth("/operations")).toBe(0);
    expect(treeDepth("/operations/runbooks")).toBe(1);
  });

  it("uses document titles as display labels", () => {
    expect(documentDisplayLabel({ title: "Runbook", path: "/runbook" })).toBe("Runbook");
    expect(documentDisplayLabel({ title: "Runbook", path: "/operations/runbook" })).toBe("Runbook");
  });

  it("keeps path context in document action labels", () => {
    expect(documentActionLabel({ title: "Runbook", path: "/runbook" })).toBe("Runbook");
    expect(documentActionLabel({ title: "Runbook", path: "/operations/runbook" })).toBe(
      "Runbook · /operations/runbook",
    );
  });

  it("counts direct folder children only", () => {
    const folderId = "folder-1";
    expect(
      countFolderChildren({
        folderId,
        folders: [
          { id: "child-folder", parentFolderId: folderId, name: "Child", path: "/parent/child" },
          { id: "nested-folder", parentFolderId: "child-folder", name: "Nested", path: "/parent/child/nested" },
        ],
        documents: [
          {
            id: "child-document",
            folderId,
            title: "Child",
            path: "/parent/child",
            contentText: "",
            updatedAt: new Date("2026-05-05T00:00:00Z"),
          },
          {
            id: "nested-document",
            folderId: "child-folder",
            title: "Nested",
            path: "/parent/child/nested",
            contentText: "",
            updatedAt: new Date("2026-05-05T00:00:00Z"),
          },
        ],
      }),
    ).toBe(2);
  });
});
