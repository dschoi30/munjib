import { randomUUID } from "node:crypto";
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { askDocumentQuestion } from "@/lib/rag/ask";
import { safeIndexSavedDocument } from "@/lib/rag/index-document";
import { embedText, chatWithContext } from "@/lib/rag/ollama";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

vi.mock("@/lib/rag/index-document", () => ({
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rag/ollama", () => ({
  embedText: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01)),
  chatWithContext: vi.fn().mockResolvedValue("Saved answer"),
}));

vi.mock("@/lib/rag/vector-store", () => ({
  searchSimilarChunks: vi.fn().mockResolvedValue([
    {
      id: "chunk-1",
      documentId: "doc-selected",
      documentTitle: "Saved Title",
      documentPath: "/saved-title",
      headingPath: "Facts",
      content: "Saved database content",
      distance: 0.1,
    },
  ]),
}));

const _askInputMustRejectDraftFields: Parameters<typeof askDocumentQuestion>[0] = {
  workspaceSlug: "workspace",
  documentId: "doc",
  actorId: "user",
  question: "question",
  // @ts-expect-error draft content must not be accepted by the ask service API
  draftContentMarkdown: "# Unsaved draft",
};

void _askInputMustRejectDraftFields;

describe("RAG ask service", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetTestData();
  });

  it("answers from saved DB content and ignores draft-like caller fields", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Saved Title",
      contentMarkdown: "# Facts\n\nSaved database content",
    });
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce([
      {
        id: "chunk-1",
        documentId: selected.id,
        documentTitle: "Saved Title",
        documentPath: "/saved-title",
        headingPath: "Facts",
        content: "Saved database content",
        distance: 0.1,
      },
    ]);

    const result = await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "  What is saved?  ",
      draftTitle: "Unsaved Title",
      draftContentMarkdown: "# Draft\n\nDo not use this",
      contentMarkdown: "# Caller content",
    } as unknown as Parameters<typeof askDocumentQuestion>[0]);

    expect(result.answer).toBe("Saved answer");
    expect(result.citations).toEqual([
      {
        index: 1,
        documentId: selected.id,
        documentTitle: "Saved Title",
        documentPath: "/saved-title",
        headingPath: "Facts",
      },
    ]);
    expect(safeIndexSavedDocument).toHaveBeenCalledWith({ documentId: selected.id });
    expect(embedText).toHaveBeenCalledWith("What is saved?");
    expect(searchSimilarChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: fixture.workspace.id,
        embeddingModel: "bge-m3",
        readableDocumentIds: [selected.id],
        limit: 60,
      }),
    );
    expect(chatWithContext).toHaveBeenCalledWith(
      expect.stringContaining("Use only the saved document context"),
      expect.stringContaining("Saved database content"),
    );
    expect(chatWithContext).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Do not use this"),
    );
  });

  it("throws DOCUMENT_NOT_FOUND when the selected document is not readable", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const restricted = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Restricted",
      contentMarkdown: "Private",
    });
    const otherUser = await prisma.user.create({
      data: { email: `other-${restricted.id}@example.com`, name: "Other User" },
    });
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: restricted.id,
        subjectType: "USER",
        subjectId: otherUser.id,
        permission: "READ",
      },
    });

    await expect(
      askDocumentQuestion({
        workspaceSlug: fixture.workspace.slug,
        documentId: restricted.id,
        actorId: fixture.user.id,
        question: "Can I read it?",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  });

  it("throws QUESTION_REQUIRED for blank questions", async () => {
    await expect(
      askDocumentQuestion({
        workspaceSlug: "workspace",
        documentId: "doc",
        actorId: "user",
        question: "  \n\t  ",
      }),
    ).rejects.toThrow("QUESTION_REQUIRED");
  });

  it("propagates Ollama and vector search failures", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Saved Title",
      contentMarkdown: "Saved content",
    });
    const failure = new Error("OLLAMA_REQUEST_FAILED");
    vi.mocked(embedText).mockRejectedValueOnce(failure);

    await expect(
      askDocumentQuestion({
        workspaceSlug: fixture.workspace.slug,
        documentId: selected.id,
        actorId: fixture.user.id,
        question: "What happened?",
      }),
    ).rejects.toThrow("OLLAMA_REQUEST_FAILED");

    vi.mocked(embedText).mockResolvedValueOnce(Array.from({ length: 1024 }, () => 0.01));
    vi.mocked(searchSimilarChunks).mockRejectedValueOnce(new Error("VECTOR_SEARCH_FAILED"));

    await expect(
      askDocumentQuestion({
        workspaceSlug: fixture.workspace.slug,
        documentId: selected.id,
        actorId: fixture.user.id,
        question: "What happened?",
      }),
    ).rejects.toThrow("VECTOR_SEARCH_FAILED");
  });

  it("refreshes only the selected saved document id before retrieval", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const originalFindMany = prisma.documentLink.findMany.bind(prisma.documentLink);
    const linkFindMany = vi
      .spyOn(prisma.documentLink, "findMany")
      .mockImplementation((args) => originalFindMany(args));
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Selected",
      contentMarkdown: "[[Linked]]",
    });
    await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Linked",
      contentMarkdown: "Linked content",
    });

    await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "What is linked?",
    });

    expect(safeIndexSavedDocument).toHaveBeenCalledTimes(1);
    expect(safeIndexSavedDocument).toHaveBeenCalledWith({ documentId: selected.id });
    expect(linkFindMany.mock.calls[0]?.[0]).not.toHaveProperty("orderBy");
  });
});

async function createSavedDocument(input: {
  workspaceId: string;
  userId: string;
  id?: string;
  title: string;
  contentMarkdown: string;
}) {
  const id = input.id ?? randomUUID();
  const slug = input.title.toLowerCase().replace(/\s+/g, "-");

  return prisma.document.create({
    data: {
      id,
      workspaceId: input.workspaceId,
      title: input.title,
      slug,
      path: `/${slug}`,
      contentMarkdown: input.contentMarkdown,
      contentText: input.contentMarkdown,
      createdById: input.userId,
      updatedById: input.userId,
    },
  });
}
