export function workspaceDocumentHref({
  workspaceSlug,
  documentId,
  searchQuery,
}: {
  workspaceSlug: string;
  documentId: string;
  searchQuery?: string;
}) {
  const params = new URLSearchParams({ document: documentId });
  if (searchQuery) {
    params.set("q", searchQuery);
  }

  return `/workspaces/${workspaceSlug}?${params.toString()}`;
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
