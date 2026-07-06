export function buildWorkspacePageWhere(input: { workspaceSlug: string; actorId: string }) {
  return {
    slug: input.workspaceSlug,
    archivedAt: null,
    members: {
      some: { userId: input.actorId },
    },
  } as const;
}
