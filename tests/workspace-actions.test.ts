import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

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
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.lookup,
}));

vi.mock("node:http", () => ({
  request: mocks.httpRequest,
}));

vi.mock("node:https", () => ({
  request: mocks.httpsRequest,
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
    mocks.httpRequest.mockImplementation(createMockNodeRequest([4, 5, 6], "image/png"));
    mocks.httpsRequest.mockImplementation(createMockNodeRequest([4, 5, 6], "image/png"));
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

  test("createDocumentAction returns a document id instead of redirecting when redirect is false", async () => {
    mocks.createDocument.mockResolvedValue({ id: "doc-created" });
    const { createDocumentAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
    const formData = new FormData();
    formData.set("folderId", "folder-engineering");
    formData.set("redirect", "false");

    const result = await createDocumentAction("company-handbook", formData);

    expect(mocks.createDocument).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
      folderId: "folder-engineering",
      title: "Untitled",
      contentMarkdown: "",
    });
    expect(result).toEqual({ documentId: "doc-created" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("importMarkdownDocumentAction returns the created document without redirect", async () => {
    mocks.isSupportedMarkdownImportFile.mockReturnValue(true);
    mocks.deriveMarkdownImportTitle.mockReturnValue("Imported");
    mocks.createDocument.mockResolvedValue({ id: "doc-imported" });
    const { importMarkdownDocumentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("markdownFile", new File(["# Imported"], "imported.md", {
      type: "text/markdown",
    }));

    const result = await importMarkdownDocumentAction("company-handbook", formData);

    expect(mocks.createDocument).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
      folderId: null,
      title: "Imported",
      contentMarkdown: "# Imported",
    });
    expect(result).toEqual({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("importMarkdownDocumentAction imports multiple markdown files into a selected folder", async () => {
    mocks.isSupportedMarkdownImportFile.mockReturnValue(true);
    mocks.deriveMarkdownImportTitle
      .mockReturnValueOnce("First")
      .mockReturnValueOnce("Second");
    mocks.createDocument
      .mockResolvedValueOnce({ id: "doc-first" })
      .mockResolvedValueOnce({ id: "doc-second" });
    const { importMarkdownDocumentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.append("markdownFiles", new File(["# First"], "first.md", {
      type: "text/markdown",
    }));
    formData.append("markdownFiles", new File(["# Second"], "second.markdown", {
      type: "text/markdown",
    }));
    formData.set("folderId", "folder-engineering");

    const result = await importMarkdownDocumentAction("company-handbook", formData);

    expect(mocks.createDocument).toHaveBeenNthCalledWith(1, {
      workspaceSlug: "company-handbook",
      actorId: "user-1",
      folderId: "folder-engineering",
      title: "First",
      contentMarkdown: "# First",
    });
    expect(mocks.createDocument).toHaveBeenNthCalledWith(2, {
      workspaceSlug: "company-handbook",
      actorId: "user-1",
      folderId: "folder-engineering",
      title: "Second",
      contentMarkdown: "# Second",
    });
    expect(result).toEqual({
      documentIds: ["doc-first", "doc-second"],
      imported: [
        { fileName: "first.md", documentId: "doc-first" },
        { fileName: "second.markdown", documentId: "doc-second" },
      ],
      failed: [],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  });

  test("importMarkdownDocumentAction imports to root when folderId is missing", async () => {
    mocks.isSupportedMarkdownImportFile.mockReturnValue(true);
    mocks.deriveMarkdownImportTitle.mockReturnValue("Root Import");
    mocks.createDocument.mockResolvedValue({ id: "doc-root" });
    const { importMarkdownDocumentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.append("markdownFiles", new File(["# Root"], "root.md", {
      type: "text/markdown",
    }));

    await importMarkdownDocumentAction("company-handbook", formData);

    expect(mocks.createDocument).toHaveBeenCalledWith(expect.objectContaining({
      folderId: null,
    }));
  });

  test("importMarkdownDocumentAction reports unsupported files while importing valid files", async () => {
    mocks.isSupportedMarkdownImportFile
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    mocks.deriveMarkdownImportTitle.mockReturnValue("Valid");
    mocks.createDocument.mockResolvedValue({ id: "doc-valid" });
    const { importMarkdownDocumentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.append("markdownFiles", new File(["# Valid"], "valid.md", {
      type: "text/markdown",
    }));
    formData.append("markdownFiles", new File(["nope"], "notes.txt", {
      type: "text/plain",
    }));

    const result = await importMarkdownDocumentAction("company-handbook", formData);

    expect(mocks.createDocument).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      documentIds: ["doc-valid"],
      imported: [{ fileName: "valid.md", documentId: "doc-valid" }],
      failed: [{ fileName: "notes.txt", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  test("importMarkdownDocumentAction reports empty files while importing valid files", async () => {
    mocks.isSupportedMarkdownImportFile.mockReturnValueOnce(true);
    mocks.deriveMarkdownImportTitle.mockReturnValue("Valid");
    mocks.createDocument.mockResolvedValue({ id: "doc-valid" });
    const { importMarkdownDocumentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.append("markdownFiles", new File(["# Valid"], "valid.md", {
      type: "text/markdown",
    }));
    formData.append("markdownFiles", new File([""], "empty.md", {
      type: "text/markdown",
    }));

    const result = await importMarkdownDocumentAction("company-handbook", formData);

    expect(mocks.createDocument).toHaveBeenCalledTimes(1);
    expect(mocks.isSupportedMarkdownImportFile).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      documentIds: ["doc-valid"],
      imported: [{ fileName: "valid.md", documentId: "doc-valid" }],
      failed: [{ fileName: "empty.md", error: "MARKDOWN_IMPORT_FILE_REQUIRED" }],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  test("importMarkdownDocumentAction reports create failures while returning prior imports", async () => {
    mocks.isSupportedMarkdownImportFile.mockReturnValue(true);
    mocks.deriveMarkdownImportTitle
      .mockReturnValueOnce("First")
      .mockReturnValueOnce("Second");
    mocks.createDocument
      .mockResolvedValueOnce({ id: "doc-first" })
      .mockRejectedValueOnce(new Error("DOCUMENT_SLUG_RETRY_EXHAUSTED"));
    const { importMarkdownDocumentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.append("markdownFiles", new File(["# First"], "first.md", {
      type: "text/markdown",
    }));
    formData.append("markdownFiles", new File(["# Second"], "second.md", {
      type: "text/markdown",
    }));

    const result = await importMarkdownDocumentAction("company-handbook", formData);

    expect(mocks.createDocument).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      documentIds: ["doc-first"],
      imported: [{ fileName: "first.md", documentId: "doc-first" }],
      failed: [{ fileName: "second.md", error: "DOCUMENT_SLUG_RETRY_EXHAUSTED" }],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  test("importMarkdownDocumentAction requires a markdown file", async () => {
    const { importMarkdownDocumentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();

    await expect(importMarkdownDocumentAction("company-handbook", formData)).rejects.toThrow(
      "MARKDOWN_IMPORT_FILE_REQUIRED",
    );
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  test("createFolderAction returns a folder id instead of redirecting when redirect is false", async () => {
    mocks.createFolder.mockResolvedValue({ id: "folder-created" });
    const { createFolderAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
    const formData = new FormData();
    formData.set("parentFolderId", "folder-engineering");
    formData.set("redirect", "false");

    const result = await createFolderAction("company-handbook", formData);

    expect(mocks.createFolder).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
      parentFolderId: "folder-engineering",
      name: "Untitled folder",
    });
    expect(result).toEqual({ folderId: "folder-created" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("archiveFolderAction passes cascade when the form opts in", async () => {
    const { archiveFolderAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
    const formData = new FormData();
    formData.set("folderId", "folder-engineering");
    formData.set("cascade", "true");

    const result = await archiveFolderAction("company-handbook", formData);

    expect(mocks.archiveFolder).toHaveBeenCalledWith({
      actorId: "user-1",
      folderId: "folder-engineering",
      cascade: true,
    });
    expect(result).toEqual({ folderId: "folder-engineering" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  test("archiveFolderAction keeps non-cascade folder-not-empty as an action result", async () => {
    mocks.archiveFolder.mockRejectedValue(new Error(SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY));
    const { archiveFolderAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
    const formData = new FormData();
    formData.set("folderId", "folder-engineering");

    const result = await archiveFolderAction("company-handbook", formData);

    expect(mocks.archiveFolder).toHaveBeenCalledWith({
      actorId: "user-1",
      folderId: "folder-engineering",
      cascade: false,
    });
    expect(result).toEqual({
      folderId: "folder-engineering",
      error: SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
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
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("imageUrl", "https://example.com/assets/diagram.png");
    formData.set("fileName", "diagram");

    const result = await pasteDocumentImageAttachmentAction("company-handbook", formData);

    expect(mocks.httpsRequest).toHaveBeenCalledWith({
      hostname: "93.184.216.34",
      port: undefined,
      method: "GET",
      path: "/assets/diagram.png",
      servername: "example.com",
      headers: {
        Host: "example.com",
      },
    }, expect.any(Function));
    expect(mocks.httpRequest).not.toHaveBeenCalled();
    const request = mocks.httpsRequest.mock.results[0]?.value;
    expect(request.setTimeout).toHaveBeenCalledWith(5_000, expect.any(Function));
    expect(request.end).toHaveBeenCalled();
    expect(request.on).toHaveBeenCalledWith("error", expect.any(Function));
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

  test("pasteDocumentImageAttachmentAction pins remote fetch to the validated address", async () => {
    mocks.lookup.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);
    mocks.pasteDocumentImageAttachment.mockResolvedValue({
      id: "attachment-1",
      documentId: "doc-1",
      markdown: "![diagram.png](/api/attachments/attachment-1)",
    });
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("imageUrl", "https://images.example.test:8443/assets/diagram.png?size=large");

    await pasteDocumentImageAttachmentAction("company-handbook", formData);

    expect(mocks.httpsRequest).toHaveBeenCalledWith({
      hostname: "203.0.113.10",
      port: "8443",
      method: "GET",
      path: "/assets/diagram.png?size=large",
      servername: "images.example.test",
      headers: {
        Host: "images.example.test:8443",
      },
    }, expect.any(Function));
  });

  test("pasteDocumentImageAttachmentAction retries the next validated address", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "203.0.113.10", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ]);
    mocks.httpsRequest
      .mockImplementationOnce(createMockNodeRequestError(new Error("connect failed")))
      .mockImplementationOnce(createMockNodeRequest([7, 8, 9], "image/png"));
    mocks.pasteDocumentImageAttachment.mockResolvedValue({
      id: "attachment-1",
      documentId: "doc-1",
      markdown: "![diagram.png](/api/attachments/attachment-1)",
    });
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("imageUrl", "https://example.com/assets/diagram.png");

    await pasteDocumentImageAttachmentAction("company-handbook", formData);

    expect(mocks.httpsRequest).toHaveBeenCalledTimes(2);
    expect(mocks.httpsRequest.mock.calls[0]?.[0]).toMatchObject({ hostname: "203.0.113.10" });
    expect(mocks.httpsRequest.mock.calls[1]?.[0]).toMatchObject({ hostname: "93.184.216.34" });
    const call = mocks.pasteDocumentImageAttachment.mock.calls[0]?.[0];
    expect(Array.from(call.bytes)).toEqual([7, 8, 9]);
  });

  test("pasteDocumentImageAttachmentAction rejects IPv4-mapped private IPv6 image URLs", async () => {
    mocks.lookup.mockResolvedValue([{ address: "::ffff:172.16.0.1", family: 6 }]);
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("imageUrl", "https://example.com/internal.png");

    await expect(pasteDocumentImageAttachmentAction("company-handbook", formData)).rejects.toThrow(
      "ATTACHMENT_MIME_TYPE_FORBIDDEN",
    );
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
    expect(mocks.pasteDocumentImageAttachment).not.toHaveBeenCalled();
  });

  test("pasteDocumentImageAttachmentAction rejects hex IPv4-mapped private IPv6 image URLs", async () => {
    mocks.lookup.mockResolvedValue([{ address: "::ffff:7f00:1", family: 6 }]);
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("imageUrl", "https://example.com/internal.png");

    await expect(pasteDocumentImageAttachmentAction("company-handbook", formData)).rejects.toThrow(
      "ATTACHMENT_MIME_TYPE_FORBIDDEN",
    );
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
    expect(mocks.pasteDocumentImageAttachment).not.toHaveBeenCalled();
  });

  test("pasteDocumentImageAttachmentAction rejects private remote image URLs before fetch", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const { pasteDocumentImageAttachmentAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("documentId", "doc-1");
    formData.set("imageUrl", "http://localhost/internal.png");

    await expect(pasteDocumentImageAttachmentAction("company-handbook", formData)).rejects.toThrow(
      "ATTACHMENT_MIME_TYPE_FORBIDDEN",
    );
    expect(mocks.httpRequest).not.toHaveBeenCalled();
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
    expect(mocks.pasteDocumentImageAttachment).not.toHaveBeenCalled();
  });
});

function createMockNodeRequest(bytes: number[], mimeType: string, statusCode = 200) {
  return (_options: unknown, callback: (response: unknown) => void) => {
    const response = {
      statusCode,
      headers: {
        "content-type": mimeType,
      },
      destroy: vi.fn(),
      resume: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array(bytes);
      },
    };
    const request = {
      end: vi.fn(),
      on: vi.fn(),
      setTimeout: vi.fn(),
      destroy: vi.fn(),
    };

    callback(response);
    return request;
  };
}

function createMockNodeRequestError(error: Error) {
  return () => {
    const request = {
      end: vi.fn(),
      on: vi.fn((event: string, handler: (error: Error) => void) => {
        if (event === "error") {
          queueMicrotask(() => handler(error));
        }

        return request;
      }),
      setTimeout: vi.fn(),
      destroy: vi.fn(),
    };

    return request;
  };
}
