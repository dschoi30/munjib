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

  it("rejects creating folders in archived workspaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedAt: new Date("2026-07-07T00:00:00.000Z") },
    });

    await expect(
      createFolder({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        parentFolderId: null,
        name: "Archived Workspace Folder",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
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

  it("rejects renaming folders in archived workspaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedAt: new Date("2026-07-07T00:00:00.000Z") },
    });

    await expect(
      renameFolder({
        folderId: operations.id,
        actorId: fixture.user.id,
        name: "People Ops",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
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

  it("archives a non-empty folder subtree when cascade is explicit", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const otherFixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const parent = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const child = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: parent.id,
      name: "Runbooks",
    });
    const grandchild = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: child.id,
      name: "Incidents",
    });
    const parentDocument = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: parent.id,
        title: "Overview",
        slug: "overview",
        path: "/operations/overview",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const grandchildDocument = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: grandchild.id,
        title: "Incident Review",
        slug: "incident-review",
        path: "/operations/runbooks/incidents/incident-review",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const archivedAt = new Date("2026-01-01T00:00:00.000Z");
    const alreadyArchivedChild = await prisma.folder.create({
      data: {
        workspaceId: fixture.workspace.id,
        parentFolderId: parent.id,
        name: "Archive Shelf",
        slug: "archive-shelf",
        path: "/operations/archive-shelf",
        status: "ARCHIVED",
        archivedAt,
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const alreadyArchivedDocument = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: parent.id,
        title: "Old Runbook",
        slug: "old-runbook",
        path: "/operations/old-runbook",
        status: "ARCHIVED",
        archivedAt,
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const otherWorkspaceFolder = await createFolder({
      workspaceSlug: otherFixture.workspace.slug,
      actorId: otherFixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });

    const archived = await archiveFolder({
      folderId: parent.id,
      actorId: fixture.user.id,
      cascade: true,
    });

    expect(archived.status).toBe("ARCHIVED");
    const archivedFolders = await prisma.folder.findMany({
      where: { id: { in: [parent.id, child.id, grandchild.id] } },
      select: { id: true, status: true, archivedAt: true, updatedById: true },
    });
    expect(archivedFolders).toHaveLength(3);
    expect(archivedFolders.every((folder) => folder.status === "ARCHIVED")).toBe(true);
    expect(archivedFolders.every((folder) => folder.archivedAt instanceof Date)).toBe(true);
    expect(archivedFolders.every((folder) => folder.updatedById === fixture.user.id)).toBe(true);

    const archivedDocuments = await prisma.document.findMany({
      where: { id: { in: [parentDocument.id, grandchildDocument.id] } },
      select: { id: true, status: true, archivedAt: true, updatedById: true },
    });
    expect(archivedDocuments).toHaveLength(2);
    expect(archivedDocuments.every((document) => document.status === "ARCHIVED")).toBe(true);
    expect(archivedDocuments.every((document) => document.archivedAt instanceof Date)).toBe(true);
    expect(archivedDocuments.every((document) => document.updatedById === fixture.user.id)).toBe(
      true,
    );

    await expect(
      prisma.folder.findUniqueOrThrow({ where: { id: otherWorkspaceFolder.id } }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(
      prisma.folder.findUniqueOrThrow({ where: { id: alreadyArchivedChild.id } }),
    ).resolves.toMatchObject({ status: "ARCHIVED", archivedAt });
    await expect(
      prisma.document.findUniqueOrThrow({ where: { id: alreadyArchivedDocument.id } }),
    ).resolves.toMatchObject({ status: "ARCHIVED", archivedAt });

    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "folder.archived",
        resourceId: parent.id,
      },
    });
    expect(auditLog.metadataJson).toMatchObject({
      path: "/operations",
      descendantFolderCount: 2,
      descendantDocumentCount: 2,
    });
  });

  it("still archives empty folders without cascade", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const folder = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Empty",
    });

    const archived = await archiveFolder({ folderId: folder.id, actorId: fixture.user.id });

    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).toBeInstanceOf(Date);
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
