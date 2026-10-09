import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import {
  archiveWorkspace,
  createWorkspace,
  listReadableWorkspacesForUser,
  renameWorkspace,
} from "@/lib/workspaces/management-service";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("workspace management service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("lists readable non-archived workspaces and excludes archived workspaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
    const active = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const archived = await seedWorkspaceFixture(WorkspaceRole.ADMIN);
    await prisma.workspaceMember.create({
      data: {
        workspaceId: active.workspace.id,
        userId: fixture.user.id,
        role: WorkspaceRole.EDITOR,
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: archived.workspace.id,
        userId: fixture.user.id,
        role: WorkspaceRole.ADMIN,
      },
    });
    await prisma.workspace.update({
      where: { id: archived.workspace.id },
      data: { archivedAt: new Date("2026-07-01T00:00:00.000Z") },
    });

    const workspaces = await listReadableWorkspacesForUser(fixture.user.id);

    expect(workspaces.map((workspace) => workspace.slug)).toContain(fixture.workspace.slug);
    expect(workspaces.map((workspace) => workspace.slug)).toContain(active.workspace.slug);
    expect(workspaces.map((workspace) => workspace.slug)).not.toContain(archived.workspace.slug);
  });

  it("creates a workspace for writer-or-better users and bootstraps launch memberships", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await upsertLaunchUser("admin@example.invalid", "Munjib Admin");
    await upsertLaunchUser("trial@example.invalid", "Munjib Trial");

    const workspace = await createWorkspace({
      actorId: fixture.user.id,
      currentWorkspaceSlug: fixture.workspace.slug,
      name: "Growth Docs",
      language: "en",
    });

    expect(workspace.name).toBe("Growth Docs");
    expect(workspace.slug).toMatch(/^growth-docs-/);
    await expect(
      prisma.workspaceMember.findMany({
        where: { workspaceId: workspace.id },
        select: { user: { select: { email: true } }, role: true },
        orderBy: { role: "asc" },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { user: { email: fixture.user.email }, role: WorkspaceRole.OWNER },
        { user: { email: "admin@example.invalid" }, role: WorkspaceRole.ADMIN },
        { user: { email: "trial@example.invalid" }, role: WorkspaceRole.VIEWER },
      ]),
    );
  });

  it("rejects workspace creation for VIEWER users", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);

    await expect(
      createWorkspace({
        actorId: fixture.user.id,
        currentWorkspaceSlug: fixture.workspace.slug,
        name: "Viewer Docs",
        language: "en",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_CREATE_FORBIDDEN);
  });

  it("renames Workspace.name without changing Workspace.slug", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.ADMIN);

    const renamed = await renameWorkspace({
      actorId: fixture.user.id,
      workspaceSlug: fixture.workspace.slug,
      name: "Renamed Handbook",
    });

    expect(renamed).toEqual({
      id: fixture.workspace.id,
      name: "Renamed Handbook",
      slug: fixture.workspace.slug,
    });
    await expect(
      prisma.workspace.findUniqueOrThrow({
        where: { id: fixture.workspace.id },
        select: { name: true, slug: true },
      }),
    ).resolves.toEqual({
      name: "Renamed Handbook",
      slug: fixture.workspace.slug,
    });
  });

  it("rejects rename and archive for non-managers", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    await expect(
      renameWorkspace({
        actorId: fixture.user.id,
        workspaceSlug: fixture.workspace.slug,
        name: "Nope",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_MANAGE_FORBIDDEN);
    await expect(
      archiveWorkspace({
        actorId: fixture.user.id,
        workspaceSlug: fixture.workspace.slug,
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_MANAGE_FORBIDDEN);
  });

  it("rejects archiving the only readable active workspace", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);

    await expect(
      archiveWorkspace({
        actorId: fixture.user.id,
        workspaceSlug: fixture.workspace.slug,
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_ARCHIVE_LAST_ACTIVE);
  });

  it("archives a workspace and returns a fallback workspace slug", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
    const fallback = await seedWorkspaceFixture(WorkspaceRole.VIEWER);
    await prisma.workspaceMember.create({
      data: {
        workspaceId: fallback.workspace.id,
        userId: fixture.user.id,
        role: WorkspaceRole.VIEWER,
      },
    });

    const result = await archiveWorkspace({
      actorId: fixture.user.id,
      workspaceSlug: fixture.workspace.slug,
    });

    expect(result).toEqual({
      archivedWorkspaceSlug: fixture.workspace.slug,
      fallbackWorkspaceSlug: fallback.workspace.slug,
    });
    await expect(
      prisma.workspace.findUniqueOrThrow({
        where: { id: fixture.workspace.id },
        select: { archivedAt: true },
      }),
    ).resolves.toEqual({ archivedAt: expect.any(Date) });
  });
});

async function upsertLaunchUser(email: string, name: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      email,
      name,
      emailVerified: new Date("2026-07-01T00:00:00.000Z"),
    },
  });
}
