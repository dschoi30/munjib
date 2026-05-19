import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveDocument: vi.fn(),
  archiveFolder: vi.fn(),
  createComment: vi.fn(),
  createDocument: vi.fn(),
  createDocumentFromBrokenLink: vi.fn(),
  createFolder: vi.fn(),
  deriveMarkdownImportTitle: vi.fn(),
  isSupportedMarkdownImportFile: vi.fn(),
  pasteDocumentImageAttachment: vi.fn(),
  redirect: vi.fn(),
  renameFolder: vi.fn(),
  requireCurrentUser: vi.fn(),
  restoreDocumentVersion: vi.fn(),
  revalidatePath: vi.fn(),
  updateDocument: vi.fn(),
  uploadDocumentAttachment: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/comments/service", () => ({
  createComment: mocks.createComment,
}));

vi.mock("@/lib/attachments/service", () => ({
  uploadDocumentAttachment: mocks.uploadDocumentAttachment,
  uploadPastedDocumentImageAttachment: mocks.pasteDocumentImageAttachment,
}));

vi.mock("@/lib/folders/service", () => ({
  archiveFolder: mocks.archiveFolder,
  createFolder: mocks.createFolder,
  renameFolder: mocks.renameFolder,
}));

vi.mock("@/lib/documents/import-markdown", () => ({
  deriveMarkdownImportTitle: mocks.deriveMarkdownImportTitle,
  isSupportedMarkdownImportFile: mocks.isSupportedMarkdownImportFile,
}));

vi.mock("@/lib/documents/service", () => ({
  archiveDocument: mocks.archiveDocument,
  createDocument: mocks.createDocument,
  createDocumentFromBrokenLink: mocks.createDocumentFromBrokenLink,
  restoreDocumentVersion: mocks.restoreDocumentVersion,
  updateDocument: mocks.updateDocument,
}));

describe("workspace document actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  test("updateDocumentAction revalidates without redirecting the current document", async () => {
    const { updateDocumentAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("title", "Updated");
    formData.set("contentMarkdown", "Body");

    await updateDocumentAction("company-handbook", formData);

    expect(mocks.updateDocument).toHaveBeenCalledWith({
      actorId: "user-1",
      contentMarkdown: "Body",
      documentId: "doc-1",
      title: "Updated",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("createCommentAction revalidates without redirecting the current document", async () => {
    const { createCommentAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("body", "Looks good");

    await createCommentAction("company-handbook", formData);

    expect(mocks.createComment).toHaveBeenCalledWith({
      actorId: "user-1",
      body: "Looks good",
      documentId: "doc-1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("pasteDocumentImageAttachmentAction uploads an image and returns markdown without redirect", async () => {
    mocks.pasteDocumentImageAttachment.mockResolvedValue({
      id: "attachment-1",
      documentId: "doc-1",
      markdown: "![clipboard.png](/api/attachments/attachment-1)",
    });
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set(
      "attachment",
      new File([new Uint8Array([1, 2, 3])], "clipboard.png", { type: "image/png" }),
    );

    const result = await pasteDocumentImageAttachmentAction("company-handbook", formData);

    expect(mocks.pasteDocumentImageAttachment).toHaveBeenCalledWith({
      actorId: "user-1",
      bytes: expect.any(Uint8Array),
      documentId: "doc-1",
      fileName: "clipboard.png",
      mimeType: "image/png",
    });
    const call = mocks.pasteDocumentImageAttachment.mock.calls[0]?.[0];
    expect(Array.from(call.bytes)).toEqual([1, 2, 3]);
    expect(result).toEqual({ markdown: "![clipboard.png](/api/attachments/attachment-1)" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("pasteDocumentImageAttachmentAction requires a file", async () => {
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");

    await expect(pasteDocumentImageAttachmentAction("company-handbook", formData)).rejects.toThrow(
      "ATTACHMENT_FILE_REQUIRED",
    );
  });
});
