import type {
  DocumentListItem,
  FolderDocumentCounts,
  FolderListItem,
} from "@/components/document-list";
import { DEFAULT_LANGUAGE, type Language } from "@/lib/i18n/language";
import { getMessage } from "@/lib/i18n/messages";

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
  folderDocumentCounts,
  selectedFolderId,
  selectedDocumentId,
}: {
  folderId: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  folderDocumentCounts?: FolderDocumentCounts;
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
}): FolderTrashSummary {
  const descendantFolderIds = new Set<string>();
  let parentFolderIds = [folderId];
  const visitedFolderIds = new Set<string>([folderId]);

  while (parentFolderIds.length > 0) {
    const childFolderIds = folders
      .filter(
        (folder) =>
          parentFolderIds.includes(folder.parentFolderId ?? "") &&
          !visitedFolderIds.has(folder.id),
      )
      .map((folder) => folder.id);

    for (const childFolderId of childFolderIds) {
      descendantFolderIds.add(childFolderId);
      visitedFolderIds.add(childFolderId);
    }

    parentFolderIds = childFolderIds;
  }

  const archivedFolderIds = new Set([folderId, ...descendantFolderIds]);
  const descendantDocumentCount = folderDocumentCounts
    ? Array.from(archivedFolderIds).reduce(
        (count, archivedFolderId) => count + (folderDocumentCounts[archivedFolderId] ?? 0),
        0,
      )
    : documents.filter((document) =>
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

export function folderTrashConfirmMessage(
  summary: FolderTrashSummary,
  language: Language = DEFAULT_LANGUAGE,
) {
  if (!hasTrashDescendants(summary)) {
    return getMessage(language, "nav.folderTrash.confirmEmpty");
  }

  const parts: string[] = [];
  if (summary.descendantFolderCount > 0) {
    parts.push(
      getMessage(
        language,
        summary.descendantFolderCount === 1
          ? "nav.folderTrash.folderCount.one"
          : "nav.folderTrash.folderCount.other",
        { count: summary.descendantFolderCount },
      ),
    );
  }
  if (summary.descendantDocumentCount > 0) {
    parts.push(
      getMessage(
        language,
        summary.descendantDocumentCount === 1
          ? "nav.folderTrash.documentCount.one"
          : "nav.folderTrash.documentCount.other",
        { count: summary.descendantDocumentCount },
      ),
    );
  }

  return getMessage(language, "nav.folderTrash.confirmWithContents", {
    items: parts.join(language === "ko" ? " 및 " : " and "),
  });
}
