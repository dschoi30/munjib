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
  ].sort(compareTreeRows);
}

function compareTreeRows(left: TreeRow, right: TreeRow) {
  if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;

  const leftLabel = left.kind === "folder" ? left.folder.name : left.document.title;
  const rightLabel = right.kind === "folder" ? right.folder.name : right.document.title;
  const labelComparison = rightLabel.localeCompare(leftLabel, undefined, {
    sensitivity: "base",
  });
  if (labelComparison !== 0) return labelComparison;

  const leftPath = left.kind === "folder" ? left.folder.path : left.document.path;
  const rightPath = right.kind === "folder" ? right.folder.path : right.document.path;
  const pathComparison = leftPath.localeCompare(rightPath);
  if (pathComparison !== 0) return pathComparison;

  const leftId = left.kind === "folder" ? left.folder.id : left.document.id;
  const rightId = right.kind === "folder" ? right.folder.id : right.document.id;
  return leftId.localeCompare(rightId);
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
