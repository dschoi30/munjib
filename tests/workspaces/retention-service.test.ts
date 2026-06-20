import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { updateWorkspaceArchivedDocumentRetentionPolicy } from "@/lib/workspaces/retention-service";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("workspace archived document retention service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("persists DAYS_90 for workspace writers", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const updated = await updateWorkspaceArchivedDocumentRetentionPolicy({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      policy: "DAYS_90",
    });

    expect(updated).toEqual({ archivedDocumentRetentionPolicy: "DAYS_90" });
    await expect(
      prisma.workspace.findUniqueOrThrow({
        where: { id: fixture.workspace.id },
        select: { archivedDocumentRetentionPolicy: true },
      }),
    ).resolves.toEqual({ archivedDocumentRetentionPolicy: "DAYS_90" });
  });

  it("rejects workspace viewers", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);

    await expect(
      updateWorkspaceArchivedDocumentRetentionPolicy({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        policy: "DAYS_90",
      }),
    ).rejects.toThrow("WORKSPACE_WRITE_FORBIDDEN");
  });

  it("rejects missing workspace slugs", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    await expect(
      updateWorkspaceArchivedDocumentRetentionPolicy({
        workspaceSlug: "missing-workspace",
        actorId: fixture.user.id,
        policy: "DAYS_90",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  });

  it("rejects ambiguous workspace slugs before saving retention policy", async () => {
    const first = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const second = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await prisma.workspace.update({
      where: { id: second.workspace.id },
      data: { slug: first.workspace.slug },
    });

    await expect(
      updateWorkspaceArchivedDocumentRetentionPolicy({
        workspaceSlug: first.workspace.slug,
        actorId: first.user.id,
        policy: "DAYS_90",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_SLUG_AMBIGUOUS);
    await expect(
      prisma.workspace.findUniqueOrThrow({
        where: { id: first.workspace.id },
        select: { archivedDocumentRetentionPolicy: true },
      }),
    ).resolves.toEqual({ archivedDocumentRetentionPolicy: "DAYS_30" });
    await expect(
      prisma.workspace.findUniqueOrThrow({
        where: { id: second.workspace.id },
        select: { archivedDocumentRetentionPolicy: true },
      }),
    ).resolves.toEqual({ archivedDocumentRetentionPolicy: "DAYS_30" });
  });
});
