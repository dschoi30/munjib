import type { PermissionLevel } from "@prisma/client";

export const leaf6DocumentAccessSlotVersion = 0 as const;

export type Leaf6DocumentAccess = Readonly<{
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null;
}>;

export const LEAF6_DOCUMENT_ACCESS_AUTHORITY_UNAVAILABLE =
  "LEAF6_DOCUMENT_ACCESS_AUTHORITY_UNAVAILABLE" as const;

/**
 * Version-zero compatibility slot for the future document ACL owner.
 *
 * This slot deliberately does not resolve workspace membership or query the
 * legacy Permission table.  The active-resource core delegates here once, but
 * the version-zero implementation cannot grant access until Leaf 6 supplies
 * the canonical DB-time ACL contract.
 */
export async function getLeaf6DocumentAccessForActor(
  _db: unknown,
  _input: { documentId: string; actorId: string },
): Promise<Leaf6DocumentAccess> {
  // The legacy Permission rows are not an active-membership authority.  A
  // version-zero slot must not be able to grant access until Leaf 6 supplies
  // its DB-time ACL contract, so this function remains metadata-only/fail
  // closed rather than querying a second source of truth.
  throw new Error(LEAF6_DOCUMENT_ACCESS_AUTHORITY_UNAVAILABLE);
}
