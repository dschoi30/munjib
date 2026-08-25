import type { AiAuthorizationPrincipal } from "@/lib/auth/trial-entitlement";
import { prisma } from "@/lib/db/client";

type TrialDocument = Readonly<{
  id: string;
  title: string;
  contentMarkdown: string;
  status: "ACTIVE";
}>;

type TrialWorkspaceRecord = Readonly<{
  id: string;
  slug: string;
  name: string;
  archivedAt: Date | null;
  documents: readonly TrialDocument[];
}>;

export type TrialWorkspaceViewer = Readonly<{
  slug: string;
  name: string;
  documents: readonly TrialDocument[];
}>;

type TrialViewerStore = Readonly<{
  findWorkspace(input: Readonly<{ id: string; slug: string }>): Promise<TrialWorkspaceRecord | null>;
  listExplicitDocumentIds(documentIds: readonly string[]): Promise<readonly string[]>;
}>;

export async function loadTrialWorkspaceViewer(
  principal: AiAuthorizationPrincipal,
  requestedSlug: string,
  store: TrialViewerStore = prismaTrialViewerStore,
): Promise<TrialWorkspaceViewer | null> {
  if (principal.kind !== "anonymous-trial-demo" || principal.access !== "viewer-only") return null;
  if (requestedSlug !== principal.workspaceSlug) return null;

  const workspace = await store.findWorkspace({ id: principal.workspaceId, slug: requestedSlug });
  if (!workspace || workspace.archivedAt !== null) return null;
  const documentIds = workspace.documents.map((document) => document.id);
  const explicitIds = new Set(
    documentIds.length > 0 ? await store.listExplicitDocumentIds(documentIds) : [],
  );
  return {
    slug: workspace.slug,
    name: workspace.name,
    documents: workspace.documents.filter(
      (document) => document.status === "ACTIVE" && !explicitIds.has(document.id),
    ),
  };
}

const prismaTrialViewerStore: TrialViewerStore = {
  findWorkspace({ id, slug }) {
    return prisma.workspace.findFirst({
      where: { id, slug, archivedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        archivedAt: true,
        documents: {
          where: { status: "ACTIVE" },
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, contentMarkdown: true, status: true },
        },
      },
    }) as Promise<TrialWorkspaceRecord | null>;
  },
  async listExplicitDocumentIds(documentIds) {
    const rows = await prisma.permission.findMany({
      where: { resourceType: "DOCUMENT", resourceId: { in: [...documentIds] } },
      distinct: ["resourceId"],
      select: { resourceId: true },
    });
    return rows.map((row) => row.resourceId);
  },
};
