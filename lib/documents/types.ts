export type CreateDocumentInput = {
  workspaceSlug: string;
  actorId: string;
  folderId?: string | null;
  title: string;
  contentMarkdown: string;
};

export type MoveDocumentInput = {
  documentId: string;
  actorId: string;
  folderId: string | null;
};

export type UpdateDocumentInput = {
  documentId: string;
  actorId: string;
  title: string;
  contentMarkdown: string;
};

export type ArchiveDocumentInput = {
  documentId: string;
  actorId: string;
};

export type RestoreDocumentVersionInput = {
  versionId: string;
  actorId: string;
};

export type CreateDocumentFromBrokenLinkInput = {
  linkId: string;
  actorId: string;
};
