import { describe, expect, it } from "vitest";
import {
  buildDocumentDisplayPathMap,
  buildFolderDisplayPathMap,
  countFolderChildren,
  documentActionLabel,
  documentDisplayDescription,
  documentDisplayLabel,
  documentDisplayPath,
  documentDisplayPathLabel,
  folderDisplayPath,
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
    expect(documentDisplayLabel({ title: "", path: "/untitled" })).toBe("Untitled");
  });

  it("keeps path context in document action labels", () => {
    expect(documentActionLabel({ title: "Runbook", path: "/runbook" })).toBe("Runbook");
    expect(documentActionLabel({ title: "Runbook", path: "/operations/runbook" })).toBe(
      "Runbook · /operations/runbook",
    );
    expect(documentActionLabel({ title: "", path: "/untitled" })).toBe("Untitled");
    expect(documentActionLabel({ title: "", path: "/operations/untitled" })).toBe(
      "Untitled · /operations/untitled",
    );
  });

  it("builds display paths from folder names and document titles", () => {
    const folders = [
      { id: "folder-engineering", parentFolderId: null, name: "Engineering", path: "/engineering" },
      {
        id: "folder-runbooks",
        parentFolderId: "folder-engineering",
        name: "Runbooks",
        path: "/engineering/runbooks",
      },
    ];
    const folderDisplayPaths = buildFolderDisplayPathMap(folders);

    expect(folderDisplayPath(folders[0], folderDisplayPaths)).toBe("Engineering");
    expect(folderDisplayPath(folders[1], folderDisplayPaths)).toBe("Engineering / Runbooks");
    expect(
      documentDisplayPath(
        {
          folderId: "folder-runbooks",
          title: "Contextual Retrieval",
          path: "/engineering/runbooks/contextual-retrieval",
        },
        folderDisplayPaths,
      ),
    ).toBe("Engineering / Runbooks / Contextual Retrieval");
    expect(
      documentDisplayPath(
        {
          folderId: "folder-runbooks",
          title: "",
          path: "/engineering/runbooks/untitled",
        },
        folderDisplayPaths,
      ),
    ).toBe("Engineering / Runbooks");
  });

  it("completes blank title display paths with the caller fallback label", () => {
    expect(
      documentDisplayPathLabel(
        {
          title: "",
          path: "/untitled",
          displayPath: "",
        },
        "제목 없음",
      ),
    ).toBe("제목 없음");
    expect(
      documentActionLabel(
        {
          title: "",
          path: "/untitled",
          displayPath: "",
        },
        "제목 없음",
      ),
    ).toBe("제목 없음");
    expect(
      documentDisplayPathLabel(
        {
          title: "",
          path: "/engineering/runbooks/untitled",
          displayPath: "Engineering / Runbooks",
        },
        "제목 없음",
      ),
    ).toBe("Engineering / Runbooks / 제목 없음");
    expect(
      documentActionLabel(
        {
          title: "",
          path: "/engineering/runbooks/untitled",
          displayPath: "Engineering / Runbooks",
        },
        "제목 없음",
      ),
    ).toBe("제목 없음 · Engineering / Runbooks / 제목 없음");
    expect(
      documentDisplayDescription(
        {
          title: "Welcome",
          path: "/welcome",
          displayPath: "Welcome",
        },
      ),
    ).toBeUndefined();
  });

  it("keeps stored path context when title display paths collide", () => {
    expect(
      documentDisplayDescription({
        title: "Runbook",
        path: "/runbook-2",
        displayPath: "Runbook",
      }),
    ).toBe("/runbook-2");
    expect(
      documentActionLabel({
        title: "Runbook",
        path: "/runbook-2",
        displayPath: "Runbook",
      }),
    ).toBe("Runbook · /runbook-2");
    expect(
      documentDisplayDescription({
        title: "Runbook",
        path: "/engineering/runbooks/runbook-2",
        displayPath: "Engineering / Runbooks / Runbook",
      }),
    ).toBe("Engineering / Runbooks / Runbook · /engineering/runbooks/runbook-2");
    expect(
      documentActionLabel({
        title: "Runbook",
        path: "/engineering/runbooks/runbook-2",
        displayPath: "Engineering / Runbooks / Runbook",
      }),
    ).toBe("Runbook · Engineering / Runbooks / Runbook · /engineering/runbooks/runbook-2");
  });

  it("uses stored path context when display paths collide through slash titles", () => {
    const slashTitleDocument = {
      title: "B / C",
      path: "/a/b-c",
      displayPath: "A / B / C",
      displayPathNeedsStoredPath: true,
    };
    const nestedDocument = {
      title: "C",
      path: "/a/b/c",
      displayPath: "A / B / C",
      displayPathNeedsStoredPath: true,
    };

    expect(documentDisplayPathLabel(slashTitleDocument)).toBe("A / B / C · /a/b-c");
    expect(documentDisplayDescription(slashTitleDocument)).toBe("A / B / C · /a/b-c");
    expect(documentActionLabel(slashTitleDocument)).toBe("B / C · A / B / C · /a/b-c");
    expect(documentDisplayPathLabel(nestedDocument)).toBe("A / B / C · /a/b/c");
    expect(documentDisplayDescription(nestedDocument)).toBe("A / B / C · /a/b/c");
    expect(documentActionLabel(nestedDocument)).toBe("C · A / B / C · /a/b/c");
  });

  it("marks computed document display path collisions for stored path disambiguation", () => {
    const folders = [
      { id: "folder-a", parentFolderId: null, name: "A", path: "/a" },
      { id: "folder-a-b", parentFolderId: "folder-a", name: "B", path: "/a/b" },
    ];
    const folderDisplayPaths = buildFolderDisplayPathMap(folders);
    const documents = [
      { id: "doc-slash-title", folderId: "folder-a", title: "B / C", path: "/a/b-c" },
      { id: "doc-nested", folderId: "folder-a-b", title: "C", path: "/a/b/c" },
      { id: "doc-other", folderId: "folder-a", title: "Other", path: "/a/other" },
    ];
    const documentDisplayPaths = buildDocumentDisplayPathMap(documents, folderDisplayPaths);

    expect(documentDisplayPaths.get("doc-slash-title")).toEqual({
      path: "A / B / C",
      needsStoredPathDisambiguation: true,
    });
    expect(documentDisplayPaths.get("doc-nested")).toEqual({
      path: "A / B / C",
      needsStoredPathDisambiguation: true,
    });
    expect(documentDisplayPaths.get("doc-other")).toEqual({
      path: "A / Other",
      needsStoredPathDisambiguation: false,
    });
  });

  it("keeps stored path fallback when a display parent is missing", () => {
    expect(
      documentDisplayPath(
        {
          folderId: "missing-folder",
          title: "Contextual Retrieval",
          path: "/engineering/runbooks/contextual-retrieval",
        },
        new Map(),
      ),
    ).toBe("engineering / runbooks / contextual-retrieval");
  });

  it("falls back to stored folder paths when folder display paths collide", () => {
    const folders = [
      { id: "folder-ops", parentFolderId: null, name: "Ops", path: "/ops" },
      {
        id: "folder-runbook",
        parentFolderId: "folder-ops",
        name: "Runbook",
        path: "/ops/runbook",
      },
      {
        id: "folder-runbook-2",
        parentFolderId: "folder-ops",
        name: "Runbook",
        path: "/ops/runbook-2",
      },
      {
        id: "folder-child",
        parentFolderId: "folder-runbook-2",
        name: "Child",
        path: "/ops/runbook-2/child",
      },
    ];
    const folderDisplayPaths = buildFolderDisplayPathMap(folders);

    expect(folderDisplayPath(folders[1], folderDisplayPaths)).toBe("ops / runbook");
    expect(folderDisplayPath(folders[2], folderDisplayPaths)).toBe("ops / runbook-2");
    expect(folderDisplayPath(folders[3], folderDisplayPaths)).toBe("ops / runbook-2 / child");
    expect(
      documentDisplayPath(
        {
          folderId: "folder-runbook-2",
          title: "Deploy",
          path: "/ops/runbook-2/deploy",
        },
        folderDisplayPaths,
      ),
    ).toBe("ops / runbook-2 / Deploy");
  });

  it("keeps descendant folders and documents on stored paths when a folder parent is missing", () => {
    const folders = [
      {
        id: "folder-runbooks",
        parentFolderId: "missing-parent",
        name: "Runbooks",
        path: "/engineering/runbooks",
      },
      {
        id: "folder-child",
        parentFolderId: "folder-runbooks",
        name: "Child",
        path: "/engineering/runbooks/child",
      },
    ];
    const folderDisplayPaths = buildFolderDisplayPathMap(folders);

    expect(folderDisplayPath(folders[0], folderDisplayPaths)).toBe("engineering / runbooks");
    expect(folderDisplayPath(folders[1], folderDisplayPaths)).toBe("engineering / runbooks / child");
    expect(
      documentDisplayPath(
        {
          folderId: "folder-child",
          title: "Child Document",
          path: "/engineering/runbooks/child/child-document",
        },
        folderDisplayPaths,
      ),
    ).toBe("engineering / runbooks / child / child-document");
  });

  it("keeps folders and documents on stored paths when folder parents cycle", () => {
    const folders = [
      {
        id: "folder-a",
        parentFolderId: "folder-b",
        name: "Folder A",
        path: "/cycle/folder-a",
      },
      {
        id: "folder-b",
        parentFolderId: "folder-a",
        name: "Folder B",
        path: "/cycle/folder-b",
      },
    ];
    const folderDisplayPaths = buildFolderDisplayPathMap(folders);

    expect(folderDisplayPath(folders[0], folderDisplayPaths)).toBe("cycle / folder-a");
    expect(folderDisplayPath(folders[1], folderDisplayPaths)).toBe("cycle / folder-b");
    expect(
      documentDisplayPath(
        {
          folderId: "folder-a",
          title: "Cycle Document",
          path: "/cycle/folder-a/cycle-document",
        },
        folderDisplayPaths,
      ),
    ).toBe("cycle / folder-a / cycle-document");
  });

  it("uses display path context in document action labels", () => {
    expect(
      documentActionLabel({
        title: "Contextual Retrieval",
        path: "/engineering/runbooks/contextual-retrieval",
        displayPath: "Engineering / Runbooks / Contextual Retrieval",
      }),
    ).toBe("Contextual Retrieval · Engineering / Runbooks / Contextual Retrieval");
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
