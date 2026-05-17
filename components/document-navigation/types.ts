import type { DocumentListItem, FolderListItem } from "@/components/document-list";

export type FavoriteState = { documents: string[]; folders: string[] };

export type RenameFolderResult = { folderId: string; error?: string };
export type ArchiveFolderResult = { folderId: string; error?: string };
export type ArchiveDocumentResult = { documentId: string };

export type OpenMenuHandler = (menuId: string | null) => void;
export type ToggleFavoriteDocumentHandler = (documentId: string) => void;
export type ToggleFavoriteFolderHandler = (folderId: string) => void;
export type OpenDocumentInNewTabHandler = (document: DocumentListItem) => void;
export type ArchiveDocumentAction = (formData: FormData) => Promise<void>;

export type TreeRow =
  | { kind: "folder"; folder: FolderListItem }
  | { kind: "document"; document: DocumentListItem };
