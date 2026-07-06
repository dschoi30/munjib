import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureCurrentUserWorkspaceAndRedirect } from "@/lib/auth/provisioning";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  workspaceMember: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: prismaMock,
}));

function createProvisioningTxMock() {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: "admin-user", email: "mjadmin@munjib.com" },
        { id: "trial-user", email: "mjtrial@munjib.com" },
      ]),
    },
    organization: {
      upsert: vi.fn().mockResolvedValue({ id: "org-1", slug: "personal-user-12345678" }),
    },
    organizationMember: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    workspace: {
      upsert: vi.fn().mockResolvedValue({
        id: "workspace-1",
        slug: "my-workspace-user-12345678",
      }),
    },
    workspaceMember: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("current user auth provisioning", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.workspaceMember.findFirst.mockReset();
    prismaMock.$transaction.mockReset();
  });

  it("wraps default workspace provisioning in one Prisma transaction", async () => {
    const tx = createProvisioningTxMock();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-12345678",
      email: "member@example.com",
      name: "Member",
    });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: ReturnType<typeof createProvisioningTxMock>) => Promise<unknown>) =>
        callback(tx),
    );
    prismaMock.workspaceMember.findFirst.mockResolvedValue({
      workspace: { slug: "my-workspace-user-12345678" },
    });

    await expect(
      ensureCurrentUserWorkspaceAndRedirect({
        userId: "user-12345678",
        language: "ko",
      }),
    ).resolves.toBe("/workspaces/my-workspace-user-12345678");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.workspace.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_slug: {
          organizationId: "org-1",
          slug: "my-workspace-user-12345678",
        },
      },
      update: { archivedAt: null },
      create: {
        organizationId: "org-1",
        name: "내 워크스페이스",
        slug: "my-workspace-user-12345678",
      },
      select: { id: true, slug: true },
    });
  });
});
