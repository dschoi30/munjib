import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { archiveFolder, createFolder, moveFolder, renameFolder } from "@/lib/folders/service";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("folder service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("creates root and nested folders with paths", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const runbooks = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: operations.id,
      name: "Runbooks",
    });

    expect(operations.path).toBe("/operations");
    expect(runbooks.path).toBe("/operations/runbooks");
  });

  it("renames a folder and recalculates descendant document paths", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const document = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: operations.id,
        title: "Onboarding",
        slug: "onboarding",
        path: "/operations/onboarding",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });

    await renameFolder({ folderId: operations.id, actorId: fixture.user.id, name: "People Ops" });

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(updated.path).toBe("/people-ops/onboarding");
  });

  it("rejects archiving non-empty folders", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const folder = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: folder.id,
        title: "Onboarding",
        slug: "onboarding",
        path: "/operations/onboarding",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });

    await expect(archiveFolder({ folderId: folder.id, actorId: fixture.user.id })).rejects.toThrow(
      "FOLDER_NOT_EMPTY",
    );
  });

  it("rejects moving a folder below its descendant", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const parent = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Parent",
    });
    const child = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: parent.id,
      name: "Child",
    });

    await expect(
      moveFolder({ folderId: parent.id, actorId: fixture.user.id, parentFolderId: child.id }),
    ).rejects.toThrow("FOLDER_MOVE_CYCLE");
  });
});
