import type { DocumentListItem, FolderListItem } from "@/components/document-list";

export type FavoriteState = { documents: string[]; folders: string[] };

export type RenameFolderResult = { folderId: string; error?: string };
export type ArchiveFolderResult = { folderId: string; error?: string };
export type ArchiveDocumentResult = { documentId: string };
export type CreateDocumentResult = { documentId: string };
export type CreateFolderResult = { folderId: string };
export type CreateDocumentFormAction = (formData: FormData) => void | Promise<void>;
export type CreateFolderFormAction = (formData: FormData) => void | Promise<void>;
export type CreateDocumentMutation = (
  formData: FormData,
) => Promise<CreateDocumentResult | void>;
export type CreateFolderMutation = (formData: FormData) => Promise<CreateFolderResult | void>;
export type CreateDocumentAction = CreateDocumentMutation;
export type CreateFolderAction = CreateFolderMutation;

export type OpenMenuHandler = (menuId: string | null) => void;
export type ToggleFavoriteDocumentHandler = (documentId: string) => void;
export type ToggleFavoriteFolderHandler = (folderId: string) => void;
export type OpenDocumentInNewTabHandler = (document: DocumentListItem) => void;
export type ArchiveDocumentAction = (formData: FormData) => Promise<void>;
export type AddFolderChildHandler = (folderId: string) => void;
export type AddFolderDocumentHandler = (folderId: string) => void;

export type TreeRow =
  | { kind: "folder"; folder: FolderListItem }
  | { kind: "document"; document: DocumentListItem };
