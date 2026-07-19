import type { Prisma, PrismaClient, WorkspaceRole } from "@prisma/client";
import { getLeaf6DocumentAccessForActor } from "@/lib/authorization/downstream/leaf6-document-access";
import {
  ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE,
  resolveActiveWorkspaceMembership,
  type ActiveMembershipDatabase,
} from "@/lib/workspaces/active-membership";

export type ActiveResourceDatabase = Prisma.TransactionClient | PrismaClient;

type WorkspaceAccess = "read" | "write";

const activeDocumentAuthorityBrand = Symbol("munjib.active-document-authority-v1");

/**
 * Runtime shape issued only by the canonical active-resource resolver.
 * Consumers must not construct this from a legacy WorkspaceMember query.
 */
export type ActiveDocumentResource = Readonly<{
  kind: "active-document";
  authorityVersion: 1;
  documentId: string;
  workspaceId: string;
  actorId: string;
  workspaceRole: WorkspaceRole;
  readonly [activeDocumentAuthorityBrand]: true;
}>;

/**
 * Issue the opaque proof only at the active-resource boundary.  Callers must
 * never derive document authority by reading WorkspaceMember or Permission.
 */
function issueActiveDocumentResource(input: {
  documentId: string;
  workspaceId: string;
  actorId: string;
  workspaceRole: WorkspaceRole;
}): ActiveDocumentResource {
  return Object.freeze({
    kind: "active-document" as const,
    authorityVersion: 1 as const,
    ...input,
    [activeDocumentAuthorityBrand]: true as const,
  });
}

export function isActiveDocumentResource(
  value: unknown,
  input: { documentId: string; actorId: string },
): value is ActiveDocumentResource {
  if (!value || typeof value !== "object") return false;
  const authority = value as Partial<ActiveDocumentResource>;
  return (
    authority[activeDocumentAuthorityBrand] === true &&
    authority.kind === "active-document" &&
    authority.authorityVersion === 1 &&
    authority.documentId === input.documentId &&
    authority.actorId === input.actorId &&
    typeof authority.workspaceId === "string" &&
    authority.workspaceId.length > 0 &&
    (authority.workspaceRole === "OWNER" ||
      authority.workspaceRole === "ADMIN" ||
      authority.workspaceRole === "EDITOR" ||
      authority.workspaceRole === "VIEWER")
  );
}

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
): Promise<ActiveDocumentResource | null> {
  throw new Error(ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE);
}

/**
 * Transaction-only document authority seam. The activated implementation must
 * lock the document and membership authority rows before issuing the proof so
 * Leaf 6 access can be read from the same transaction without a TOCTOU window.
 */
export async function resolveActiveDocumentForActorForUpdate(
  _tx: Prisma.TransactionClient,
  _input: { documentId: string; actorId: string; access: WorkspaceAccess },
): Promise<ActiveDocumentResource | null> {
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
