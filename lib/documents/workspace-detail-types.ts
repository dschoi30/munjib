import type { DocumentEditorProps } from "@/components/document-editor/types";

export type WorkspaceDocumentDetail = Pick<DocumentEditorProps, "canWrite" | "tags" | "properties" | "comments" | "linkPanels"> & {
  document: { id: string; title: string; path: string; contentMarkdown: string };
  versions: { id: string; versionNumber: number; title: string; changeSummary: string | null }[];
  auditLogs: { id: string; action: string }[];
  attachments: { id: string; fileName: string; mimeType: string; size: number }[];
};
