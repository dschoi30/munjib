import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { seedWorkspaceFixture } from "../setup/prisma";
import { loadWorkspaceDocument } from "@/lib/documents/workspace-detail";

afterAll(() => prisma.$disconnect());

describe("workspace document detail", () => {
  it("returns an authorized document bundle without exposing unrelated document data", async () => {
    const { user, workspace } = await seedWorkspaceFixture("EDITOR");
    const document = await prisma.document.create({ data: {
      workspaceId: workspace.id, title: "Split document", slug: "split", path: "/split",
      contentMarkdown: "# Split", contentText: "Split", createdById: user.id, updatedById: user.id,
    } });
    const detail = await loadWorkspaceDocument(workspace.slug, document.id, user.id);
    expect(detail).toMatchObject({ document: { id: document.id, title: "Split document" }, canWrite: true,
      versions: [], attachments: [], comments: [], auditLogs: [] });
  });
  it("rejects another workspace, nonmembers, revoked grants and archived documents", async () => {
    const { user, workspace } = await seedWorkspaceFixture("EDITOR");
    const outsider = await seedWorkspaceFixture("OWNER");
    const document = await prisma.document.create({ data: {
      workspaceId: workspace.id, title: "Private", slug: "private", path: "/private",
      contentMarkdown: "secret", contentText: "secret", createdById: user.id, updatedById: user.id,
    } });
    expect(await loadWorkspaceDocument(outsider.workspace.slug, document.id, user.id)).toBeNull();
    expect(await loadWorkspaceDocument(workspace.slug, document.id, outsider.user.id)).toBeNull();
    const grant = await prisma.permission.create({ data: {
      resourceType: "DOCUMENT", resourceId: document.id, subjectType: "USER",
      subjectId: user.id, permission: "READ",
    } });
    expect(await loadWorkspaceDocument(workspace.slug, document.id, user.id)).toMatchObject({ canWrite: false });
    await prisma.permission.update({ where: { id: grant.id }, data: { subjectId: outsider.user.id } });
    expect(await loadWorkspaceDocument(workspace.slug, document.id, user.id)).toBeNull();
    await prisma.permission.delete({ where: { id: grant.id } });
    await prisma.document.update({ where: { id: document.id }, data: { status: "ARCHIVED" } });
    expect(await loadWorkspaceDocument(workspace.slug, document.id, user.id)).toBeNull();
  });

});
