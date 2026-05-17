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
});
