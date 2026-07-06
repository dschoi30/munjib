import { describe, expect, it, vi } from "vitest";
import {
  defaultWorkspaceNameForLanguage,
  ensureDefaultWorkspaceForUser,
  resolveAccessibleWorkspaceRedirect,
  sanitizePostAuthCallbackPath,
} from "@/lib/auth/provisioning";

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

describe("auth provisioning", () => {
  it("chooses localized default workspace names from the hydrated UI language", () => {
    expect(defaultWorkspaceNameForLanguage("en")).toBe("My Workspace");
    expect(defaultWorkspaceNameForLanguage("ko")).toBe("내 워크스페이스");
  });

  it("creates a localized default workspace and launch memberships for new users", async () => {
    const tx = createProvisioningTxMock();

    const result = await ensureDefaultWorkspaceForUser(tx, {
      userId: "user-12345678",
      email: "member@example.com",
      name: "Member",
      language: "ko",
    });

    expect(tx.organization.upsert).toHaveBeenCalledWith({
      where: { slug: "personal-user-12345678" },
      update: {},
      create: {
        name: "Member",
        slug: "personal-user-12345678",
      },
      select: { id: true, slug: true },
    });
    expect(tx.workspace.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_slug: {
          organizationId: "org-1",
          slug: "my-workspace-user-12345678",
        },
      },
      update: {},
      create: {
        organizationId: "org-1",
        name: "내 워크스페이스",
        slug: "my-workspace-user-12345678",
      },
      select: { id: true, slug: true },
    });
    expect(tx.organizationMember.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: "org-1",
          userId: "user-12345678",
        },
      },
      update: { role: "OWNER" },
      create: { organizationId: "org-1", userId: "user-12345678", role: "OWNER" },
    });
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "workspace-1", userId: "user-12345678" } },
      update: { role: "OWNER" },
      create: { workspaceId: "workspace-1", userId: "user-12345678", role: "OWNER" },
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
    expect(result).toEqual({
      workspaceId: "workspace-1",
      workspaceSlug: "my-workspace-user-12345678",
    });
  });

  it("does not create another workspace when the user already has access", async () => {
    const tx = createProvisioningTxMock();
    tx.workspaceMember.findFirst.mockResolvedValue({
      workspace: { id: "workspace-existing", slug: "existing-workspace" },
    });

    const result = await ensureDefaultWorkspaceForUser(tx, {
      userId: "user-12345678",
      email: "member@example.com",
      name: "Member",
      language: "en",
    });

    expect(tx.organization.upsert).not.toHaveBeenCalled();
    expect(tx.workspace.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      workspaceId: "workspace-existing",
      workspaceSlug: "existing-workspace",
    });
  });

  it("keeps post-auth callbacks app-local and workspace-scoped", () => {
    expect(sanitizePostAuthCallbackPath("/workspaces/company-handbook?document=doc-1")).toBe(
      "/workspaces/company-handbook?document=doc-1",
    );
    expect(sanitizePostAuthCallbackPath("https://evil.example/workspaces/company-handbook")).toBeNull();
    expect(sanitizePostAuthCallbackPath("/\\evil.example")).toBeNull();
    expect(sanitizePostAuthCallbackPath("/api/auth/signout")).toBeNull();
  });

  it("prefers an accessible workspace callback and otherwise falls back to first accessible workspace", async () => {
    const tx = {
      workspaceMember: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ workspace: { slug: "team-handbook" } })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ workspace: { slug: "fallback" } }),
      },
    };

    await expect(
      resolveAccessibleWorkspaceRedirect(tx, {
        userId: "user-1",
        callbackPath: "/workspaces/team-handbook?document=doc-1",
      }),
    ).resolves.toBe("/workspaces/team-handbook?document=doc-1");

    await expect(
      resolveAccessibleWorkspaceRedirect(tx, {
        userId: "user-1",
        callbackPath: "/workspaces/missing",
      }),
    ).resolves.toBe("/workspaces/fallback");
  });

  it("ignores archived workspace callbacks and falls back to an active workspace", async () => {
    const tx = {
      workspaceMember: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ workspace: { slug: "active-workspace" } }),
      },
    };

    await expect(
      resolveAccessibleWorkspaceRedirect(tx, {
        userId: "user-1",
        callbackPath: "/workspaces/archived-workspace?document=doc-1",
      }),
    ).resolves.toBe("/workspaces/active-workspace");
    expect(tx.workspaceMember.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        userId: "user-1",
        workspace: {
          slug: "archived-workspace",
          archivedAt: null,
        },
      },
      select: { workspace: { select: { slug: true } } },
    });
    expect(tx.workspaceMember.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: "user-1",
        workspace: { archivedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: { workspace: { select: { slug: true } } },
    });
  });
});
