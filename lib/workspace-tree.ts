import type { Document, Folder, PermissionLevel, WorkspaceRole } from "@prisma/client";
import { canReadDocument } from "@/lib/permissions/document";
import { slugifyTitle } from "@/lib/text/slug";

export type WorkspaceTreeDocument = Pick<
  Document,
  "id" | "folderId" | "title" | "path" | "contentText" | "updatedAt"
>;

export type WorkspaceTreeFolder = Pick<Folder, "id" | "parentFolderId" | "name" | "path">;

export type DisplayPathFolder = Pick<Folder, "id" | "parentFolderId" | "name" | "path">;

type ResolvedFolderDisplayPath = { path: string; valid: boolean };

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

function formatStoredPath(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments.length ? segments.join(" / ") : "/";
}

function fallbackPathSegment(path: string, fallbackLabel: string) {
  return path.split("/").filter(Boolean).at(-1) ?? fallbackLabel;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function needsStoredPathDisambiguation(
  document: Pick<Document, "title" | "path">,
  fallbackLabel: string,
) {
  const label = documentDisplayLabel(document, fallbackLabel);
  const storedLeaf = fallbackPathSegment(document.path, "");
  const titleSlug = slugifyTitle(label);
  return new RegExp(`^${escapeRegExp(titleSlug)}-\\d+$`).test(storedLeaf);
}

function folderNameLabel(folder: Pick<Folder, "name" | "path">, fallbackLabel: string) {
  return folder.name.trim() || fallbackPathSegment(folder.path, fallbackLabel);
}

function joinDisplayPath(parentDisplayPath: string, label: string) {
  return parentDisplayPath === "/" ? label : `${parentDisplayPath} / ${label}`;
}

export function documentDisplayLabel(
  document: Pick<Document, "title" | "path">,
  fallbackLabel = "Untitled",
) {
  return document.title.trim() || fallbackLabel;
}

export function buildFolderDisplayPathMap<TFolder extends DisplayPathFolder>(
  folders: TFolder[],
  fallbackLabel = "Untitled folder",
) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderDisplayPaths = new Map<string, string>();
  const resolvedFolderDisplayPaths = new Map<string, ResolvedFolderDisplayPath>();
  const resolvingFolderIds = new Set<string>();

  function resolveFolderDisplayPath(folder: TFolder): ResolvedFolderDisplayPath {
    const cachedDisplayPath = resolvedFolderDisplayPaths.get(folder.id);
    if (cachedDisplayPath) {
      return cachedDisplayPath;
    }

    if (resolvingFolderIds.has(folder.id)) {
      return { path: formatStoredPath(folder.path), valid: false };
    }

    resolvingFolderIds.add(folder.id);

    const label = folderNameLabel(folder, fallbackLabel);
    const parentFolder = folder.parentFolderId ? foldersById.get(folder.parentFolderId) : null;
    const displayPath: ResolvedFolderDisplayPath = ((): ResolvedFolderDisplayPath => {
      if (!folder.parentFolderId) {
        return { path: label, valid: true };
      }

      if (!parentFolder) {
        return { path: formatStoredPath(folder.path), valid: false };
      }

      const parentDisplayPath: ResolvedFolderDisplayPath = resolveFolderDisplayPath(parentFolder);
      return parentDisplayPath.valid
        ? { path: joinDisplayPath(parentDisplayPath.path, label), valid: true }
        : { path: formatStoredPath(folder.path), valid: false };
    })();

    resolvingFolderIds.delete(folder.id);
    resolvedFolderDisplayPaths.set(folder.id, displayPath);

    if (displayPath.valid) {
      folderDisplayPaths.set(folder.id, displayPath.path);
    }

    return displayPath;
  }

  for (const folder of folders) {
    resolveFolderDisplayPath(folder);
  }

  return folderDisplayPaths;
}

export function folderDisplayPath(
  folder: Pick<Folder, "id" | "path">,
  folderDisplayPaths: Map<string, string>,
) {
  return folderDisplayPaths.get(folder.id) ?? formatStoredPath(folder.path);
}

export function documentDisplayPath(
  document: Pick<Document, "folderId" | "title" | "path">,
  folderDisplayPaths: Map<string, string>,
) {
  const label = document.title.trim();

  if (!document.folderId) {
    return label;
  }

  const parentDisplayPath = folderDisplayPaths.get(document.folderId);
  if (!parentDisplayPath) {
    return label ? formatStoredPath(document.path) : "";
  }

  if (!label) {
    return parentDisplayPath;
  }

  return joinDisplayPath(parentDisplayPath, label);
}

export function documentDisplayPathLabel(
  document: Pick<Document, "title" | "path"> & { displayPath?: string },
  fallbackLabel = "Untitled",
) {
  const label = documentDisplayLabel(document, fallbackLabel);
  const title = document.title.trim();

  if (document.displayPath !== undefined) {
    if (title) {
      return document.displayPath;
    }

    if (!document.displayPath || document.displayPath === "/") {
      return label;
    }

    return joinDisplayPath(document.displayPath, label);
  }

  if (!title && (document.path === "/" || document.path === "/untitled")) {
    return label;
  }

  const rootPath = `/${slugifyTitle(label)}`;
  return document.path === rootPath ? label : formatStoredPath(document.path);
}

export function documentDisplayDescription(
  document: Pick<Document, "title" | "path"> & { displayPath?: string },
  fallbackLabel = "Untitled",
) {
  const label = documentDisplayLabel(document, fallbackLabel);
  const title = document.title.trim();

  if (document.displayPath !== undefined) {
    const displayPath = documentDisplayPathLabel(document, fallbackLabel);
    const needsDisambiguation = needsStoredPathDisambiguation(document, fallbackLabel);
    if (displayPath === label) {
      return needsDisambiguation ? document.path : undefined;
    }

    return needsDisambiguation ? `${displayPath} · ${document.path}` : displayPath;
  }

  if (!title && (document.path === "/" || document.path === "/untitled")) {
    return undefined;
  }

  const rootPath = `/${slugifyTitle(label)}`;
  if (document.path === rootPath) {
    return undefined;
  }

  return document.path;
}

export function documentActionLabel(
  document: Pick<Document, "title" | "path"> & { displayPath?: string },
  fallbackLabel = "Untitled",
) {
  const label = documentDisplayLabel(document, fallbackLabel);
  if (document.displayPath !== undefined) {
    const displayPath = documentDisplayPathLabel(document, fallbackLabel);
    const needsDisambiguation = needsStoredPathDisambiguation(document, fallbackLabel);
    if (displayPath === label) {
      return needsDisambiguation ? `${label} · ${document.path}` : label;
    }

    return needsDisambiguation
      ? `${label} · ${displayPath} · ${document.path}`
      : `${label} · ${displayPath}`;
  }

  if (!document.title.trim() && (document.path === "/" || document.path === "/untitled")) {
    return label;
  }

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
