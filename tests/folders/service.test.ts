import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { archiveFolder, createFolder, moveFolder, renameFolder } from "@/lib/folders/service";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
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

  it("rejects creating a folder below a parent from another workspace", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const otherFixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const otherParent = await createFolder({
      workspaceSlug: otherFixture.workspace.slug,
      actorId: otherFixture.user.id,
      parentFolderId: null,
      name: "External Parent",
    });

    await expect(
      createFolder({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        parentFolderId: otherParent.id,
        name: "Child",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.PARENT_FOLDER_NOT_FOUND);
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
      SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY,
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
    ).rejects.toThrow(SERVICE_ERROR_CODES.FOLDER_MOVE_CYCLE);
  });

  it("recomputes a folder slug when moving into a parent with a same-name child", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const sourceParent = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Source",
    });
    const destinationParent = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Destination",
    });
    await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: destinationParent.id,
      name: "Runbooks",
    });
    const moving = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: sourceParent.id,
      name: "Runbooks",
    });

    const moved = await moveFolder({
      folderId: moving.id,
      actorId: fixture.user.id,
      parentFolderId: destinationParent.id,
    });

    expect(moved.slug).toBe("runbooks-2");
    expect(moved.path).toBe("/destination/runbooks-2");
  });

  it("rejects moving a folder below a parent from another workspace", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const otherFixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const folder = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Local",
    });
    const otherParent = await createFolder({
      workspaceSlug: otherFixture.workspace.slug,
      actorId: otherFixture.user.id,
      parentFolderId: null,
      name: "External Parent",
    });

    await expect(
      moveFolder({
        folderId: folder.id,
        actorId: fixture.user.id,
        parentFolderId: otherParent.id,
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.PARENT_FOLDER_NOT_FOUND);
  });
});
