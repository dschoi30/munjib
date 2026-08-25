export function workspaceDocumentHref({
  workspaceSlug,
  documentId,
  searchQuery,
  mode = "authenticated",
}: {
  workspaceSlug: string;
  documentId: string;
  searchQuery?: string;
  mode?: "authenticated" | "anonymous-trial-readonly";
}) {
  const params = new URLSearchParams({ document: documentId });
  if (searchQuery) {
    params.set("q", searchQuery);
  }

  const workspacePath = mode === "anonymous-trial-readonly"
    ? `/trial/workspaces/${workspaceSlug}`
    : `/workspaces/${workspaceSlug}`;
  return `${workspacePath}?${params.toString()}`;
}

export function workspaceGraphHref({
  workspaceSlug,
  documentId,
}: {
  workspaceSlug: string;
  documentId?: string | null;
}) {
  const params = new URLSearchParams();
  if (documentId) params.set("document", documentId);
  params.set("graph", "1");
  return `/workspaces/${workspaceSlug}?${params.toString()}`;
}
