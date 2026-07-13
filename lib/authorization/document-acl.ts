import type { PermissionLevel, WorkspaceRole } from "@prisma/client";
import {
  canReadDocument,
  canWriteDocument,
  capDocumentPermissionByWorkspaceRole,
} from "@/lib/permissions/document";
import {
  isActiveDocumentResource,
  type ActiveDocumentResource,
} from "@/lib/authorization/active-resources";

export type DocumentAclOperation = "read" | "write";

export type DocumentAclDecision = Readonly<{
  allowed: boolean;
  reason:
    | "AUTHORIZED"
    | "ACTIVE_RESOURCE_AUTHORITY_REQUIRED"
    | "DOCUMENT_READ_FORBIDDEN"
    | "DOCUMENT_WRITE_FORBIDDEN";
  effectivePermission: PermissionLevel | null;
}>;

function deniedDecision(
  reason: Exclude<DocumentAclDecision["reason"], "AUTHORIZED">,
  effectivePermission: PermissionLevel | null = null,
): DocumentAclDecision {
  return { allowed: false, reason, effectivePermission };
}

/**
 * Evaluate Leaf 6's document grant only after the active-resource authority
 * has proven the actor/document pair and active workspace role.
 */
export function decideDocumentAcl(input: {
  authority: ActiveDocumentResource | null | undefined;
  documentId?: string;
  actorId?: string;
  operation: DocumentAclOperation;
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null | undefined;
}): DocumentAclDecision {
  if (
    !input.documentId ||
    !input.actorId ||
    !isActiveDocumentResource(input.authority, {
      documentId: input.documentId,
      actorId: input.actorId,
    })
  ) {
    return deniedDecision("ACTIVE_RESOURCE_AUTHORITY_REQUIRED");
  }

  const workspaceRole: WorkspaceRole = input.authority.workspaceRole;
  const effectivePermission =
    input.explicitPermissionCount > 0
      ? capDocumentPermissionByWorkspaceRole(workspaceRole, input.userPermission)
      : null;
  const permissionInput = {
    workspaceRole,
    explicitPermissionCount: input.explicitPermissionCount,
    userPermission: effectivePermission,
  };
  const allowed =
    input.operation === "read"
      ? canReadDocument(permissionInput)
      : canWriteDocument(permissionInput);

  if (allowed) {
    return {
      allowed: true,
      reason: "AUTHORIZED",
      effectivePermission:
        effectivePermission ?? (workspaceRole === "VIEWER" ? "READ" : workspaceRole === "EDITOR" ? "WRITE" : "MANAGE"),
    };
  }

  return deniedDecision(
    input.operation === "read" ? "DOCUMENT_READ_FORBIDDEN" : "DOCUMENT_WRITE_FORBIDDEN",
    effectivePermission,
  );
}
