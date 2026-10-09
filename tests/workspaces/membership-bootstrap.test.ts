import { describe, expect, it, vi } from "vitest";
import {
  backfillLaunchMembershipsForAllWorkspaces,
  ensureWorkspaceLaunchMemberships,
  launchAccountSeeds,
} from "@/lib/workspaces/membership-bootstrap";

function createTxMock(
  existingMemberships: Array<{ workspaceId: string; userId: string; role: string }> = [],
) {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: "admin-user", email: "admin@example.invalid" },
        { id: "trial-user", email: "trial@example.invalid" },
      ]),
    },
    workspace: {
      findMany: vi.fn().mockResolvedValue([{ id: "workspace-1" }, { id: "workspace-2" }]),
    },
    workspaceMember: {
      findMany: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          existingMemberships
            .filter(
              (membership) =>
                membership.workspaceId === where.workspaceId &&
                where.userId.in.includes(membership.userId),
            )
            .map(({ userId, role }) => ({ userId, role })),
        ),
      ),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("workspace membership bootstrap", () => {
  it("defines the launch accounts and their global workspace roles", () => {
    expect(launchAccountSeeds).toEqual([
      {
        email: "admin@example.invalid",
        name: "Munjib Admin",
        workspaceRole: "ADMIN",
      },
      {
        email: "trial@example.invalid",
        name: "Munjib Trial",
        workspaceRole: "VIEWER",
      },
    ]);
  });

  it("idempotently inserts owner plus launch account workspace memberships", async () => {
    const tx = createTxMock();

    await ensureWorkspaceLaunchMemberships(tx, "workspace-1", {
      userId: "owner-user",
      role: "OWNER",
    });

    expect(tx.workspaceMember.upsert).toHaveBeenCalledTimes(3);
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace-1", userId: "owner-user" } },
      update: { role: "OWNER" },
      create: { workspaceId: "workspace-1", userId: "owner-user", role: "OWNER" },
    });
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace-1", userId: "admin-user" } },
      update: { role: "ADMIN" },
      create: { workspaceId: "workspace-1", userId: "admin-user", role: "ADMIN" },
    });
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace-1", userId: "trial-user" } },
      update: { role: "VIEWER" },
      create: { workspaceId: "workspace-1", userId: "trial-user", role: "VIEWER" },
    });
  });

  it("backfills launch memberships for every workspace", async () => {
    const tx = createTxMock();

    await backfillLaunchMembershipsForAllWorkspaces(tx);

    expect(tx.workspace.findMany).toHaveBeenCalledWith({ select: { id: true } });
    expect(tx.user.findMany).toHaveBeenCalledTimes(1);
    expect(tx.workspaceMember.upsert).toHaveBeenCalledTimes(4);
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_userId: { workspaceId: "workspace-2", userId: "trial-user" } },
        update: { role: "VIEWER" },
      }),
    );
  });

  it("preserves existing launch account owners during backfill", async () => {
    const tx = createTxMock([{ workspaceId: "workspace-1", userId: "admin-user", role: "OWNER" }]);

    await backfillLaunchMembershipsForAllWorkspaces(tx);

    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace-1", userId: "admin-user" } },
      update: { role: "OWNER" },
      create: { workspaceId: "workspace-1", userId: "admin-user", role: "OWNER" },
    });
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace-2", userId: "admin-user" } },
      update: { role: "ADMIN" },
      create: { workspaceId: "workspace-2", userId: "admin-user", role: "ADMIN" },
    });
  });

  it("preserves an explicit owner role when the owner is a launch account", async () => {
    const tx = createTxMock();

    await ensureWorkspaceLaunchMemberships(tx, "workspace-1", {
      userId: "admin-user",
      role: "OWNER",
    });

    expect(tx.workspaceMember.upsert).toHaveBeenCalledTimes(2);
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace-1", userId: "admin-user" } },
      update: { role: "OWNER" },
      create: { workspaceId: "workspace-1", userId: "admin-user", role: "OWNER" },
    });
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace-1", userId: "trial-user" } },
      update: { role: "VIEWER" },
      create: { workspaceId: "workspace-1", userId: "trial-user", role: "VIEWER" },
    });
  });
});
