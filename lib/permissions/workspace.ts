import type { WorkspaceRole } from "@prisma/client";

const readableRoles = new Set<WorkspaceRole>(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);
const writableRoles = new Set<WorkspaceRole>(["OWNER", "ADMIN", "EDITOR"]);
const manageableRoles = new Set<WorkspaceRole>(["OWNER", "ADMIN"]);

export function canReadWorkspace(role: WorkspaceRole | null | undefined) {
  return role ? readableRoles.has(role) : false;
}

export function canWriteWorkspace(role: WorkspaceRole | null | undefined) {
  return role ? writableRoles.has(role) : false;
}

export function canManageWorkspace(role: WorkspaceRole | null | undefined) {
  return role ? manageableRoles.has(role) : false;
}

export function assertCanReadWorkspace(role: WorkspaceRole | null | undefined) {
  if (!canReadWorkspace(role)) {
    throw new Error("WORKSPACE_READ_FORBIDDEN");
  }
}

export function assertCanWriteWorkspace(role: WorkspaceRole | null | undefined) {
  if (!canWriteWorkspace(role)) {
    throw new Error("WORKSPACE_WRITE_FORBIDDEN");
  }
}

export function assertCanManageWorkspace(role: WorkspaceRole | null | undefined) {
  if (!canManageWorkspace(role)) {
    throw new Error("WORKSPACE_MANAGE_FORBIDDEN");
  }
}
