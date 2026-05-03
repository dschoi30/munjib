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

export function canReadDocument(input: {
  workspaceRole: WorkspaceRole | null | undefined;
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null | undefined;
}) {
  if (canManageWorkspace(input.workspaceRole)) return true;
  if (input.explicitPermissionCount > 0) {
    return input.userPermission ? permissionRanks[input.userPermission] >= permissionRanks.READ : false;
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
    return input.userPermission ? permissionRanks[input.userPermission] >= permissionRanks.WRITE : false;
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
