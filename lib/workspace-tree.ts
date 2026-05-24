import type { Document, Folder, PermissionLevel, WorkspaceRole } from "@prisma/client";
import { canReadDocument } from "@/lib/permissions/document";
import { slugifyTitle } from "@/lib/text/slug";

export type WorkspaceTreeDocument = Pick<
  Document,
  "id" | "folderId" | "title" | "path" | "contentText" | "updatedAt"
>;

export type WorkspaceTreeFolder = Pick<Folder, "id" | "parentFolderId" | "name" | "path">;

export function filterReadableDocuments<TDocument extends WorkspaceTreeDocument>(input: {
  documents: TDocument[];
  role: WorkspaceRole;
  explicitDocumentIds: Set<string>;
  userPermissionsByDocumentId: Map<string, PermissionLevel | null>;
}) {
  return input.documents.filter((document) =>
    canReadDocument({
      workspaceRole: input.role,
      explicitPermissionCount: input.explicitDocumentIds.has(document.id) ? 1 : 0,
      userPermission: input.userPermissionsByDocumentId.get(document.id),
    }),
  );
}

export function treeDepth(path: string) {
  return Math.max(0, path.split("/").filter(Boolean).length - 1);
}

export function documentDisplayLabel(document: Pick<Document, "title" | "path">) {
  return document.title.trim() || "Untitled";
}

export function documentActionLabel(document: Pick<Document, "title" | "path">) {
  const label = documentDisplayLabel(document);
  const rootPath = `/${slugifyTitle(label)}`;
  return document.path === rootPath ? label : `${label} · ${document.path}`;
}

export function countFolderChildren(input: {
  folderId: string;
  folders: WorkspaceTreeFolder[];
  documents: WorkspaceTreeDocument[];
}) {
  return (
    input.folders.filter((folder) => folder.parentFolderId === input.folderId).length +
    input.documents.filter((document) => document.folderId === input.folderId).length
  );
}
