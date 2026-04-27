export type CreateDocumentInput = {
  workspaceSlug: string;
  actorId: string;
  title: string;
  contentMarkdown: string;
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

export type CreateDocumentFromBrokenLinkInput = {
  linkId: string;
  actorId: string;
};
