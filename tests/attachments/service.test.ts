import { unlink } from "node:fs/promises";
import path from "node:path";
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rag/index-document", () => ({
  scheduleSavedDocumentIndex: vi.fn(),
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
}));

import {
  getReadableAttachment,
  uploadDocumentAttachment,
  uploadPastedDocumentImageAttachment,
} from "@/lib/attachments/service";
import { prisma } from "@/lib/db/client";
import { createDocument } from "@/lib/documents/service";
import { scheduleSavedDocumentIndex } from "@/lib/rag/index-document";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("attachment service", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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
    vi.clearAllMocks();

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
    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceType: "attachment", resourceId: attachment.id },
    });
    expect(auditLogs).toHaveLength(1);
    expect(scheduleSavedDocumentIndex).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: document.id }),
    );
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

  it("maps a missing attachment file to a stable not-found error", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Missing File Target",
      contentMarkdown: "# Missing File Target",
    });
    const attachment = await uploadDocumentAttachment({
      documentId: document.id,
      actorId: fixture.user.id,
      fileName: "missing.txt",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("missing soon"),
    });
    const persisted = await prisma.attachment.findUniqueOrThrow({
      where: { id: attachment.id },
    });
    await unlink(path.join(process.cwd(), "storage", "attachments", persisted.storageKey));

    await expect(getReadableAttachment(attachment.id, fixture.user.id)).rejects.toThrow(
      "ATTACHMENT_NOT_FOUND",
    );
  });

  it("fails closed when a persisted storage key is malformed", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Malformed Key Target",
      contentMarkdown: "# Malformed Key Target",
    });
    const attachment = await prisma.attachment.create({
      data: {
        documentId: document.id,
        fileName: "notes.txt",
        mimeType: "text/plain",
        size: 1,
        storageKey: "../escape",
        uploadedById: fixture.user.id,
      },
    });

    await expect(getReadableAttachment(attachment.id, fixture.user.id)).rejects.toThrow(
      SERVICE_ERROR_CODES.ATTACHMENT_STORAGE_KEY_INVALID,
    );
  });

  it("uploads a pasted image attachment without changing document markdown or versions", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Paste Target",
      contentMarkdown: "# Paste Target",
    });
    vi.clearAllMocks();

    const attachment = await uploadPastedDocumentImageAttachment({
      documentId: document.id,
      actorId: fixture.user.id,
      fileName: "clipboard.png",
      mimeType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    });

    expect(attachment.fileName).toBe("clipboard.png");
    expect(attachment.markdown).toBe(`![clipboard.png](/api/attachments/${attachment.id})`);

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { versions: true },
    });
    expect(updated.contentMarkdown).toBe("# Paste Target");
    expect(updated.versions).toHaveLength(1);
    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceType: "attachment", resourceId: attachment.id },
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: "attachment.uploaded",
      resourceType: "attachment",
      resourceId: attachment.id,
    });
    expect(auditLogs[0]?.metadataJson).toMatchObject({
      source: "clipboard-paste",
      documentId: document.id,
      fileName: "clipboard.png",
      mimeType: "image/png",
      size: 4,
    });
    expect(scheduleSavedDocumentIndex).not.toHaveBeenCalled();
  });

  it("uses a fallback file name for unnamed pasted images", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Fallback Target",
      contentMarkdown: "# Fallback Target",
    });

    const attachment = await uploadPastedDocumentImageAttachment({
      documentId: document.id,
      actorId: fixture.user.id,
      fileName: "",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(attachment.fileName).toBe("pasted-image.png");
    expect(attachment.markdown).toBe(`![pasted-image.png](/api/attachments/${attachment.id})`);
  });

  it("rejects non-image pasted attachments", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Reject Target",
      contentMarkdown: "# Reject Target",
    });

    await expect(
      uploadPastedDocumentImageAttachment({
        documentId: document.id,
        actorId: fixture.user.id,
        fileName: "notes.txt",
        mimeType: "text/plain",
        bytes: new TextEncoder().encode("hello"),
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
  });
});
