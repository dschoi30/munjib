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
