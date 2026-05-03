import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createComment } from "@/lib/comments/service";
import { prisma } from "@/lib/db/client";
import { createDocument } from "@/lib/documents/service";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("comment service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("creates a document comment and audit log", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Comment Target",
      contentMarkdown: "# Comment Target",
    });

    const comment = await createComment({
      documentId: document.id,
      actorId: fixture.user.id,
      body: "Please review this section.",
    });

    expect(comment.body).toBe("Please review this section.");
    await expect(
      prisma.auditLog.findMany({
        where: { resourceType: "comment", resourceId: comment.id },
      }),
    ).resolves.toHaveLength(1);
  });

  it("rejects empty comments", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Empty Comment Target",
      contentMarkdown: "# Empty Comment Target",
    });

    await expect(
      createComment({
        documentId: document.id,
        actorId: fixture.user.id,
        body: "   ",
      }),
    ).rejects.toThrow("COMMENT_BODY_REQUIRED");
  });
});
