import type { Prisma, PrismaClient } from "@prisma/client";
import { getLeaf6DocumentAccessForActor } from "@/lib/authorization/downstream/leaf6-document-access";
import {
  ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE,
  resolveActiveWorkspaceMembership,
  type ActiveMembershipDatabase,
} from "@/lib/workspaces/active-membership";

export type ActiveResourceDatabase = Prisma.TransactionClient | PrismaClient;

type WorkspaceAccess = "read" | "write";

/**
 * Shared active-resource entrypoint reserved for the canonical DB-time
 * membership resolver.  The current release has no such database function or
 * support-access relation, so normal callers fail before any membership row is
 * inspected.  This intentionally prevents a legacy WorkspaceMember fallback.
 */
export async function resolveActiveWorkspaceForActor(
  _db: ActiveResourceDatabase,
  _input: { workspaceSlug: string; actorId: string; access?: WorkspaceAccess },
): Promise<never> {
  throw new Error(ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE);
}

/**
 * Transactional authorization seam.  Once the owning dependency provides the
 * two-argument DB-time resolver, this function is the only place that may
 * consume it for locked mutation callers.
 */
export async function resolveActiveWorkspaceForActorForUpdate(
  db: ActiveMembershipDatabase,
  input: { workspaceId: string; actorId: string; access?: WorkspaceAccess },
): Promise<never> {
  // Keep the canonical call visible at this boundary.  The current provider
  // rejects before any legacy membership query can become an authority.
  await resolveActiveWorkspaceMembership(db, {
    workspaceId: input.workspaceId,
    userId: input.actorId,
  });
  throw new Error(ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE);
}

export async function resolveActiveDocumentForActor(
  _db: ActiveResourceDatabase,
  _input: { documentId: string; actorId: string; access: WorkspaceAccess },
): Promise<never> {
  throw new Error(ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE);
}

/**
 * Leaf 6 owns document-level ACL semantics.  Keep this delegation available
 * from the first release without importing a future Leaf 6 implementation.
 */
export function getDocumentAccessForActor(
  db: ActiveResourceDatabase,
  documentId: string,
  actorId: string,
) {
  return getLeaf6DocumentAccessForActor(db, { documentId, actorId });
}
