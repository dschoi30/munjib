import type { ArchivedDocumentRetentionPolicy } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import {
  assertCanReadWorkspace,
  assertCanWriteWorkspace,
} from "@/lib/permissions/workspace";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";

export type UpdateWorkspaceArchivedDocumentRetentionPolicyInput = {
  workspaceSlug: string;
  actorId: string;
  policy: ArchivedDocumentRetentionPolicyValue;
};

export async function updateWorkspaceArchivedDocumentRetentionPolicy(
  input: UpdateWorkspaceArchivedDocumentRetentionPolicyInput,
) {
  const workspaces = await prisma.workspace.findMany({
    where: { slug: input.workspaceSlug },
    include: {
      members: {
        where: { userId: input.actorId },
        take: 1,
      },
    },
    take: 2,
  });

  if (workspaces.length === 0) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }

  if (workspaces.length > 1) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_SLUG_AMBIGUOUS);
  }

  const workspace = workspaces[0];
  const role = workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  assertCanWriteWorkspace(role);

  return prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      archivedDocumentRetentionPolicy:
        input.policy as ArchivedDocumentRetentionPolicy,
    },
    select: { archivedDocumentRetentionPolicy: true },
  });
}
