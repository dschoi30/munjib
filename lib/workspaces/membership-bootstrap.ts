import type { WorkspaceRole } from "@prisma/client";

import { resolveLaunchAccountSeeds } from "@/lib/auth/launch-accounts";
export { launchAccountSeeds } from "@/lib/auth/launch-accounts";

type WorkspaceMembershipBootstrapTx = {
  user: {
    findMany(args: {
      where: { email: { in: string[] } };
      select: { id: true; email: true };
    }): Promise<Array<{ id: string; email: string }>>;
  };
  workspace: {
    findMany(args: { select: { id: true } }): Promise<Array<{ id: string }>>;
  };
  workspaceMember: {
    findMany(args: {
      where: { workspaceId: string; userId: { in: string[] } };
      select: { userId: true; role: true };
    }): Promise<Array<{ userId: string; role: WorkspaceRole }>>;
    upsert(args: {
      where: { workspaceId_userId: { workspaceId: string; userId: string } };
      update: { role: WorkspaceRole };
      create: { workspaceId: string; userId: string; role: WorkspaceRole };
    }): Promise<unknown>;
  };
};

export async function ensureWorkspaceLaunchMemberships(
  tx: WorkspaceMembershipBootstrapTx,
  workspaceId: string,
  ownerMembership?: { userId: string; role?: WorkspaceRole },
  prefetchedLaunchUsers?: Array<{ id: string; email: string }>,
) {
  const launchAccountSeeds = resolveLaunchAccountSeeds();
  const launchUsers =
    prefetchedLaunchUsers ??
    (await tx.user.findMany({
      where: { email: { in: launchAccountSeeds.map((account) => account.email) } },
      select: { id: true, email: true },
    }));
  const existingLaunchOwners = new Set(
    (
      await tx.workspaceMember.findMany({
        where: { workspaceId, userId: { in: launchUsers.map((user) => user.id) } },
        select: { userId: true, role: true },
      })
    )
      .filter((membership) => membership.role === "OWNER")
      .map((membership) => membership.userId),
  );

  const membershipsByUserId = new Map<string, WorkspaceRole>();
  if (ownerMembership) {
    membershipsByUserId.set(ownerMembership.userId, ownerMembership.role ?? "OWNER");
  }

  for (const user of launchUsers) {
    if (membershipsByUserId.has(user.id)) continue;

    const role =
      existingLaunchOwners.has(user.id)
        ? "OWNER"
        : launchAccountSeeds.find((account) => account.email === user.email)?.workspaceRole ??
          "VIEWER";
    membershipsByUserId.set(user.id, role);
  }

  for (const [userId, role] of membershipsByUserId) {
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      update: { role },
      create: {
        workspaceId,
        userId,
        role,
      },
    });
  }
}

export async function backfillLaunchMembershipsForAllWorkspaces(tx: WorkspaceMembershipBootstrapTx) {
  const launchAccountSeeds = resolveLaunchAccountSeeds();
  const workspaces = await tx.workspace.findMany({ select: { id: true } });
  const launchUsers = await tx.user.findMany({
    where: { email: { in: launchAccountSeeds.map((account) => account.email) } },
    select: { id: true, email: true },
  });
  for (const workspace of workspaces) {
    await ensureWorkspaceLaunchMemberships(tx, workspace.id, undefined, launchUsers);
  }
}
