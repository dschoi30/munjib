import type { Prisma, PrismaClient, WorkspaceRole } from "@prisma/client";

/**
 * Canonical active-membership authority contract.
 *
 * The database-time resolver and its support-grant semantics are owned by the
 * authentication/journal dependency.  Until that dependency is installed,
 * this boundary must not fall back to reading WorkspaceMember directly: doing
 * so would create a second authorization source and could expose archived
 * resources.  The implementation therefore fails closed by design.
 */
export type ActiveMembershipDatabase = Prisma.TransactionClient | PrismaClient;

export type ActiveWorkspaceMembership = Readonly<{
  membershipId: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  supportAccessGrantId: string | null;
}>;

export const ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE =
  "ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE" as const;

export async function resolveActiveWorkspaceMembership(
  _db: ActiveMembershipDatabase,
  _input: { workspaceId: string; userId: string },
): Promise<ActiveWorkspaceMembership | null> {
  throw new Error(ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE);
}
