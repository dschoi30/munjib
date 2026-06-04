import type { Prisma } from "@prisma/client";

export async function lockFolderMutation(tx: Prisma.TransactionClient, folderId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('munjib:folder'), hashtext(${folderId}))`;
}

export async function lockWorkspaceFolderTreeMutation(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('munjib:workspace-folder-tree'), hashtext(${workspaceId}))`;
}
