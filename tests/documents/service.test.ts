import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveDocument,
  createDocument,
  updateDocument,
} from "@/lib/documents/service";
import { prisma } from "@/lib/db/client";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("document service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("creates a document with version and audit log", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Engineering Guide",
      contentMarkdown: "# Engineering Guide\n\nHello team",
    });

    expect(document.slug).toBe("engineering-guide");

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.versionNumber).toBe(1);

    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: document.id, action: "document.created" },
    });
    expect(auditLogs).toHaveLength(1);
  });

  it("creates a unique slug when a title already exists in the workspace", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const first = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Untitled",
      contentMarkdown: "",
    });
    const second = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Untitled",
      contentMarkdown: "",
    });

    expect(first.slug).toBe("untitled");
    expect(second.slug).toBe("untitled-2");
    expect(second.path).toBe("/untitled-2");
  });

  it("updates a document with a new version and audit log", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });

    const updated = await updateDocument({
      documentId: document.id,
      actorId: fixture.user.id,
      title: "Incident Runbook",
      contentMarkdown: "# Incident Runbook\n\nUpdated",
    });

    expect(updated.title).toBe("Incident Runbook");

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions.map((version) => version.versionNumber)).toEqual([1, 2]);

    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: document.id, action: "document.updated" },
    });
    expect(auditLogs).toHaveLength(1);
  });

  it("creates a unique slug when updating to an existing title", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Policy",
      contentMarkdown: "# Policy",
    });

    const updated = await updateDocument({
      documentId: document.id,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook copy",
    });

    expect(updated.slug).toBe("runbook-2");
    expect(updated.path).toBe("/runbook-2");
  });

  it("prevents viewer users from writing", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);

    await expect(
      createDocument({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        title: "Viewer Doc",
        contentMarkdown: "Denied",
      }),
    ).rejects.toThrow("WORKSPACE_WRITE_FORBIDDEN");
  });

  it("prevents editors without explicit document permission from updating restricted documents", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const restricted = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Restricted Plan",
      contentMarkdown: "# Restricted Plan",
    });
    const otherEditor = await prisma.user.create({
      data: { email: `other-editor-${restricted.id}@example.com`, name: "Other Editor" },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: fixture.workspace.id, userId: otherEditor.id, role: WorkspaceRole.EDITOR },
    });
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: restricted.id,
        subjectType: "USER",
        subjectId: fixture.user.id,
        permission: "MANAGE",
      },
    });

    await expect(
      updateDocument({
        documentId: restricted.id,
        actorId: otherEditor.id,
        title: "Restricted Plan",
        contentMarkdown: "Denied",
      }),
    ).rejects.toThrow("DOCUMENT_READ_FORBIDDEN");
  });

  it("archives a document without hard deleting it", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Old Policy",
      contentMarkdown: "Archive this",
    });

    const archived = await archiveDocument({
      documentId: document.id,
      actorId: fixture.user.id,
    });

    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });
});
