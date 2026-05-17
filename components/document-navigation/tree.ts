import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import type { TreeRow } from "@/components/document-navigation/types";

export function buildTreeItems(
  folders: FolderListItem[],
  documents: DocumentListItem[],
  parentFolderId: string | null,
): TreeRow[] {
  return [
    ...folders
      .filter((folder) => folder.parentFolderId === parentFolderId)
      .map((folder) => ({ kind: "folder" as const, folder })),
    ...documents
      .filter((document) => document.folderId === parentFolderId)
      .map((document) => ({ kind: "document" as const, document })),
  ].sort((left, right) => {
    const leftPath = left.kind === "folder" ? left.folder.path : left.document.path;
    const rightPath = right.kind === "folder" ? right.folder.path : right.document.path;
    return leftPath.localeCompare(rightPath);
  });
}

export function hasTreeChildren(
  folders: FolderListItem[],
  documents: DocumentListItem[],
  folderId: string,
) {
  return (
    folders.some((folder) => folder.parentFolderId === folderId) ||
    documents.some((document) => document.folderId === folderId)
  );
}
