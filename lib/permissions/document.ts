import type { PermissionLevel, WorkspaceRole } from "@prisma/client";
import {
  canManageWorkspace,
  canReadWorkspace,
  canWriteWorkspace,
} from "@/lib/permissions/workspace";

const permissionRanks: Record<PermissionLevel, number> = {
  READ: 1,
  WRITE: 2,
  MANAGE: 3,
};

export const workspacePermissionCeilings: Record<WorkspaceRole, PermissionLevel> = {
  OWNER: "MANAGE",
  ADMIN: "MANAGE",
  EDITOR: "WRITE",
  VIEWER: "READ",
};

export function highestPermissionLevel(
  permissions: Array<PermissionLevel | null | undefined>,
): PermissionLevel | null {
  let highest: PermissionLevel | null = null;

  for (const permission of permissions) {
    if (!permission) continue;
    if (!highest || permissionRanks[permission] > permissionRanks[highest]) {
      highest = permission;
    }
  }

  return highest;
}

/**
 * A document grant can narrow access, but it cannot elevate an actor beyond
 * the active workspace role that the canonical resource resolver establishes.
 */
export function capDocumentPermissionByWorkspaceRole(
  workspaceRole: WorkspaceRole | null | undefined,
  permission: PermissionLevel | null | undefined,
): PermissionLevel | null {
  if (!workspaceRole || !permission) return null;

  const ceiling = workspacePermissionCeilings[workspaceRole];
  return permissionRanks[permission] <= permissionRanks[ceiling] ? permission : ceiling;
}

export function canReadDocument(input: {
  workspaceRole: WorkspaceRole | null | undefined;
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null | undefined;
}) {
  if (canManageWorkspace(input.workspaceRole)) return true;
  if (input.explicitPermissionCount > 0) {
    const effectivePermission = capDocumentPermissionByWorkspaceRole(
      input.workspaceRole,
      input.userPermission,
    );
    return effectivePermission ? permissionRanks[effectivePermission] >= permissionRanks.READ : false;
  }
  return canReadWorkspace(input.workspaceRole);
}

export function canWriteDocument(input: {
  workspaceRole: WorkspaceRole | null | undefined;
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null | undefined;
}) {
  if (canManageWorkspace(input.workspaceRole)) return true;
  if (input.explicitPermissionCount > 0) {
    const effectivePermission = capDocumentPermissionByWorkspaceRole(
      input.workspaceRole,
      input.userPermission,
    );
    return effectivePermission ? permissionRanks[effectivePermission] >= permissionRanks.WRITE : false;
  }
  return canWriteWorkspace(input.workspaceRole);
}

export function assertCanReadDocument(input: {
  workspaceRole: WorkspaceRole | null | undefined;
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null | undefined;
}) {
  if (!canReadDocument(input)) {
    throw new Error("DOCUMENT_READ_FORBIDDEN");
  }
}

export function assertCanWriteDocument(input: {
  workspaceRole: WorkspaceRole | null | undefined;
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null | undefined;
}) {
  if (!canWriteDocument(input)) {
    throw new Error("DOCUMENT_WRITE_FORBIDDEN");
  }
}
