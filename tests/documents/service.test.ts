import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rag/index-document", () => ({
  scheduleSavedDocumentIndex: vi.fn(),
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
}));

import {
  archiveDocument,
  createDocument,
  createDocumentFromBrokenLink,
  moveDocument,
  restoreDocumentVersion,
  updateDocument,
} from "@/lib/documents/service";
import { prisma } from "@/lib/db/client";
import { createFolder } from "@/lib/folders/service";
import { scheduleSavedDocumentIndex } from "@/lib/rag/index-document";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("document service", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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
    expect(scheduleSavedDocumentIndex).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: document.id }),
    );
  });

  it("extracts tags and frontmatter properties when creating a document", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Review Plan",
      contentMarkdown: `---
owner: Platform
status: draft
review_due_at: 2026-05-01
---

# Review Plan

Track #review work.`,
    });

    const tags = await prisma.documentTag.findMany({
      where: { documentId: document.id },
      include: { tag: true },
    });
    const properties = await prisma.documentProperty.findMany({
      where: { documentId: document.id },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });

    expect(tags.map((documentTag) => documentTag.tag.normalizedName)).toEqual(["review"]);
    expect(properties.map((property) => [property.key, property.valueJson, property.sortOrder])).toEqual([
      ["owner", "Platform", 0],
      ["status", "draft", 1],
      ["review_due_at", "2026-05-01", 2],
    ]);
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

  it("allows duplicate document titles in different folders", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const engineering = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Engineering",
    });

    const first = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: operations.id,
      title: "Onboarding",
      contentMarkdown: "",
    });
    const second = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: engineering.id,
      title: "Onboarding",
      contentMarkdown: "",
    });

    expect(first.slug).toBe("onboarding");
    expect(first.path).toBe("/operations/onboarding");
    expect(second.slug).toBe("onboarding");
    expect(second.path).toBe("/engineering/onboarding");
  });

  it("moves a document into a folder and recalculates path", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const folder = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "",
    });
    vi.clearAllMocks();

    const moved = await moveDocument({
      documentId: document.id,
      actorId: fixture.user.id,
      folderId: folder.id,
    });

    expect(moved.path).toBe("/operations/runbook");
    expect(scheduleSavedDocumentIndex).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: moved.id }),
    );
  });

  it("updates a document with a new version and audit log", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });
    vi.clearAllMocks();

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
    expect(scheduleSavedDocumentIndex).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: updated.id }),
    );
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

  it("rejects creating documents in archived workspaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedAt: new Date("2026-07-07T00:00:00.000Z") },
    });

    await expect(
      createDocument({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        title: "Archived Workspace Doc",
        contentMarkdown: "Denied",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  });

  it("rejects updating documents in archived workspaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Active Doc",
      contentMarkdown: "Before archive",
    });
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedAt: new Date("2026-07-07T00:00:00.000Z") },
    });

    await expect(
      updateDocument({
        documentId: document.id,
        actorId: fixture.user.id,
        title: "Updated After Archive",
        contentMarkdown: "Denied",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
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

  it("restores a previous document version and records a new version", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Restore Target",
      contentMarkdown: "# Version 1\n\n#old",
    });
    await updateDocument({
      documentId: document.id,
      actorId: fixture.user.id,
      title: "Restore Target Updated",
      contentMarkdown: "# Version 2\n\n#new",
    });
    const firstVersion = await prisma.documentVersion.findFirstOrThrow({
      where: { documentId: document.id, versionNumber: 1 },
    });
    vi.clearAllMocks();

    const restored = await restoreDocumentVersion({
      versionId: firstVersion.id,
      actorId: fixture.user.id,
    });

    expect(restored.title).toBe("Restore Target");
    expect(restored.contentMarkdown).toBe("# Version 1\n\n#old");
    await expect(
      prisma.documentVersion.findMany({
        where: { documentId: document.id },
        orderBy: { versionNumber: "asc" },
      }),
    ).resolves.toHaveLength(3);
    await expect(
      prisma.auditLog.findMany({
        where: { resourceId: document.id, action: "document.version_restored" },
      }),
    ).resolves.toHaveLength(1);
    const tags = await prisma.documentTag.findMany({
      where: { documentId: document.id },
      include: { tag: true },
    });
    expect(tags.map((documentTag) => documentTag.tag.normalizedName)).toEqual(["old"]);
    expect(scheduleSavedDocumentIndex).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: restored.id }),
    );
  });

  it("rejects restoring document versions in archived workspaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Archived Restore Target",
      contentMarkdown: "# Version 1",
    });
    const firstVersion = await prisma.documentVersion.findFirstOrThrow({
      where: { documentId: document.id, versionNumber: 1 },
    });
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedAt: new Date("2026-07-07T00:00:00.000Z") },
    });

    await expect(
      restoreDocumentVersion({
        versionId: firstVersion.id,
        actorId: fixture.user.id,
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  });

  it("creates a missing target document from a broken link and refreshes its RAG index", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: `---
links:
  - "[[Missing Target]]"
---`,
    });
    const broken = await prisma.documentLink.findFirstOrThrow({
      where: {
        sourceDocumentId: source.id,
        targetTitleRaw: "Missing Target",
        isBroken: true,
      },
    });
    vi.clearAllMocks();

    const created = await createDocumentFromBrokenLink({
      linkId: broken.id,
      actorId: fixture.user.id,
    });

    expect(created.title).toBe("Missing Target");
    expect(scheduleSavedDocumentIndex).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: created.id }),
    );
  });

  it("rejects creating documents from broken links in archived workspaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Archived Source",
      contentMarkdown: `---
links:
  - "[[Archived Missing Target]]"
---`,
    });
    const broken = await prisma.documentLink.findFirstOrThrow({
      where: {
        sourceDocumentId: source.id,
        targetTitleRaw: "Archived Missing Target",
        isBroken: true,
      },
    });
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedAt: new Date("2026-07-07T00:00:00.000Z") },
    });

    await expect(
      createDocumentFromBrokenLink({
        linkId: broken.id,
        actorId: fixture.user.id,
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  });
});
