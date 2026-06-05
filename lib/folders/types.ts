export type CreateFolderInput = {
  workspaceSlug: string;
  actorId: string;
  parentFolderId: string | null;
  name: string;
};

export type RenameFolderInput = {
  folderId: string;
  actorId: string;
  name: string;
};

export type MoveFolderInput = {
  folderId: string;
  actorId: string;
  parentFolderId: string | null;
};

export type ArchiveFolderInput = {
  folderId: string;
  actorId: string;
  cascade?: boolean;
};
