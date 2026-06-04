import type { DocumentListItem, FolderListItem } from "@/components/document-list";

export type FolderTrashSummary = {
  descendantFolderCount: number;
  descendantDocumentCount: number;
  selectedFolderWillBeArchived: boolean;
  selectedDocumentWillBeArchived: boolean;
};

export function getFolderTrashSummary({
  folderId,
  folders,
  documents,
  selectedFolderId,
  selectedDocumentId,
}: {
  folderId: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
}): FolderTrashSummary {
  const descendantFolderIds = new Set<string>();
  let parentFolderIds = [folderId];

  while (parentFolderIds.length > 0) {
    const childFolderIds = folders
      .filter((folder) => parentFolderIds.includes(folder.parentFolderId ?? ""))
      .map((folder) => folder.id);

    for (const childFolderId of childFolderIds) {
      descendantFolderIds.add(childFolderId);
    }

    parentFolderIds = childFolderIds;
  }

  const archivedFolderIds = new Set([folderId, ...descendantFolderIds]);
  const descendantDocumentCount = documents.filter((document) =>
    document.folderId ? archivedFolderIds.has(document.folderId) : false,
  ).length;
  const selectedDocument = selectedDocumentId
    ? documents.find((document) => document.id === selectedDocumentId)
    : undefined;

  return {
    descendantFolderCount: descendantFolderIds.size,
    descendantDocumentCount,
    selectedFolderWillBeArchived: selectedFolderId
      ? archivedFolderIds.has(selectedFolderId)
      : false,
    selectedDocumentWillBeArchived: selectedDocument?.folderId
      ? archivedFolderIds.has(selectedDocument.folderId)
      : false,
  };
}

export function hasTrashDescendants(summary: FolderTrashSummary) {
  return summary.descendantFolderCount > 0 || summary.descendantDocumentCount > 0;
}

export function folderTrashConfirmMessage(summary: FolderTrashSummary) {
  if (!hasTrashDescendants(summary)) return "Move this folder to trash?";

  const parts: string[] = [];
  if (summary.descendantFolderCount > 0) {
    parts.push(
      `${summary.descendantFolderCount} ${
        summary.descendantFolderCount === 1 ? "folder" : "folders"
      }`,
    );
  }
  if (summary.descendantDocumentCount > 0) {
    parts.push(
      `${summary.descendantDocumentCount} ${
        summary.descendantDocumentCount === 1 ? "document" : "documents"
      }`,
    );
  }

  return `Move this folder and ${parts.join(" and ")} to trash?`;
}
