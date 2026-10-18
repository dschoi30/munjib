import type { DocumentProperty, Tag } from "@prisma/client";
import type { ClientRagChatProviderAvailability } from "@/lib/rag/client-model-settings";
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
  /** Whether this tab is visible in its pane, independent of keyboard focus. */
  isActive?: boolean;
  /** Increment only after a confirmed restore and the refreshed snapshot arrive. */
  resetVersion?: number;
  onDirtyChange?: (documentId: string, dirty: boolean) => void;
  initialTrialAiAllowance?: import("@/lib/auth/trial-entitlement").TrialAiAllowanceProjection | null;
  workspaceSlug: string;
  defaultChatModel: string;
  defaultChatProvider: "ollama" | "openai" | "openai-compatible";
  availableChatProviders: ClientRagChatProviderAvailability;
  document: EditableDocument | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<{ attachmentId: string } | { error: string } | void>;
  pasteImageAttachmentAction: (formData: FormData) => Promise<{ markdown: string }>;
  attachmentIds: string[];
  linkCandidates: LinkCandidate[];
  tags: Pick<Tag, "id" | "name">[];
  properties: Pick<DocumentProperty, "id" | "key" | "valueJson">[];
  comments: CommentItem[];
  linkPanels: DocumentLinkPanels;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
  createCommentAction: (formData: FormData) => Promise<void>;
};
