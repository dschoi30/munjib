import type { DocumentProperty, Tag } from "@prisma/client";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";

export type EditableDocument = {
  id: string;
  title: string;
  contentMarkdown: string;
};

export type LinkCandidate = {
  id: string;
  slug: string;
  title: string;
  path: string;
};

export type CommentItem = {
  id: string;
  body: string;
  user: { name: string; email: string };
};

export type DocumentEditorProps = {
  document: EditableDocument | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  pasteImageAttachmentAction: (formData: FormData) => Promise<{ markdown: string }>;
  linkCandidates: LinkCandidate[];
  tags: Pick<Tag, "id" | "name">[];
  properties: Pick<DocumentProperty, "id" | "key" | "valueJson">[];
  comments: CommentItem[];
  linkPanels: DocumentLinkPanels;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
  createCommentAction: (formData: FormData) => Promise<void>;
};
