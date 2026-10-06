export type WorkspaceMode = "authenticated" | "anonymous-trial-readonly";

export function workspaceBaseHref({ workspaceSlug, mode = "authenticated" }: { workspaceSlug: string; mode?: WorkspaceMode }) {
  return `${mode === "anonymous-trial-readonly" ? "/trial" : ""}/workspaces/${workspaceSlug}`;
}

export function workspaceStorageScope(workspaceSlug: string, mode: WorkspaceMode) {
  return mode === "anonymous-trial-readonly" ? `trial:${workspaceSlug}` : workspaceSlug;
}

export function workspaceFolderHref({ workspaceSlug, folderId, mode }: { workspaceSlug: string; folderId: string; mode?: WorkspaceMode }) {
  return `${workspaceBaseHref({ workspaceSlug, mode })}?${new URLSearchParams({ folder: folderId })}`;
}

export function workspaceDocumentHref({
  workspaceSlug,
  documentId,
  searchQuery,
  mode = "authenticated",
}: {
  workspaceSlug: string;
  documentId: string;
  searchQuery?: string;
  mode?: WorkspaceMode;
}) {
  const params = new URLSearchParams({ document: documentId });
  if (searchQuery) {
    params.set("q", searchQuery);
  }

  const workspacePath = workspaceBaseHref({ workspaceSlug, mode });
  return `${workspacePath}?${params.toString()}`;
}

export function workspaceGraphHref({
  workspaceSlug,
  documentId,
  mode,
}: {
  workspaceSlug: string;
  documentId?: string | null;
  mode?: WorkspaceMode;
}) {
  const params = new URLSearchParams();
  if (documentId) params.set("document", documentId);
  params.set("graph", "1");
  return `${workspaceBaseHref({ workspaceSlug, mode })}?${params.toString()}`;
}
