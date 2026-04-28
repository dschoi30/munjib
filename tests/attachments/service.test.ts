import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { uploadDocumentAttachment } from "@/lib/attachments/service";
import { prisma } from "@/lib/db/client";
import { createDocument } from "@/lib/documents/service";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("attachment service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("uploads an attachment and appends a markdown link", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Attachment Target",
      contentMarkdown: "# Attachment Target",
    });

    const attachment = await uploadDocumentAttachment({
      documentId: document.id,
      actorId: fixture.user.id,
      fileName: "notes.txt",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("hello"),
    });

    expect(attachment.fileName).toBe("notes.txt");
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(updated.contentMarkdown).toContain(`[notes.txt](/api/attachments/${attachment.id})`);
    await expect(
      prisma.auditLog.findMany({
        where: { resourceType: "attachment", resourceId: attachment.id },
      }),
    ).resolves.toHaveLength(1);
  });

  it("prevents viewers from uploading attachments", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);
    const editor = await prisma.user.create({
      data: { email: `attachment-editor-${fixture.workspace.id}@example.com`, name: "Editor User" },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: fixture.workspace.id, userId: editor.id, role: WorkspaceRole.EDITOR },
    });
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: editor.id,
      title: "Viewer Upload Target",
      contentMarkdown: "# Viewer Upload Target",
    });

    await expect(
      uploadDocumentAttachment({
        documentId: document.id,
        actorId: fixture.user.id,
        fileName: "notes.txt",
        mimeType: "text/plain",
        bytes: new TextEncoder().encode("hello"),
      }),
    ).rejects.toThrow("WORKSPACE_WRITE_FORBIDDEN");
  });
});
