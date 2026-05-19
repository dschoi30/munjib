import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.lookup,
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
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  test("pasteDocumentImageAttachmentAction fetches remote HTML image URLs on the server", async () => {
    mocks.pasteDocumentImageAttachment.mockResolvedValue({
      id: "attachment-1",
      documentId: "doc-1",
      markdown: "![diagram.png](/api/attachments/attachment-1)",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([4, 5, 6]), {
        headers: { "content-type": "image/png" },
        status: 200,
      })),
    );
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("imageUrl", "https://example.com/assets/diagram.png");
    formData.set("fileName", "diagram");

    const result = await pasteDocumentImageAttachmentAction("company-handbook", formData);

    expect(fetch).toHaveBeenCalledWith(new URL("https://example.com/assets/diagram.png"), {
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.lookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
    expect(mocks.pasteDocumentImageAttachment).toHaveBeenCalledWith({
      actorId: "user-1",
      bytes: expect.any(Uint8Array),
      documentId: "doc-1",
      fileName: "diagram",
      mimeType: "image/png",
    });
    const call = mocks.pasteDocumentImageAttachment.mock.calls[0]?.[0];
    expect(Array.from(call.bytes)).toEqual([4, 5, 6]);
    expect(result).toEqual({ markdown: "![diagram.png](/api/attachments/attachment-1)" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("pasteDocumentImageAttachmentAction rejects private remote image URLs before fetch", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    vi.stubGlobal("fetch", vi.fn());
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("imageUrl", "http://localhost/internal.png");

    await expect(pasteDocumentImageAttachmentAction("company-handbook", formData)).rejects.toThrow(
      "ATTACHMENT_MIME_TYPE_FORBIDDEN",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.pasteDocumentImageAttachment).not.toHaveBeenCalled();
  });
});
