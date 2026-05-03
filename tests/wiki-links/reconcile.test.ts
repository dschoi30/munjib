import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createDocument, createDocumentFromBrokenLink, updateDocument } from "@/lib/documents/service";
import { prisma } from "@/lib/db/client";
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("wiki link reconciliation", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("stores outgoing links and backlinks for existing target documents", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Runbook]].",
    });

    const sourcePanels = await getDocumentLinkPanels(source.id, fixture.user.id);
    const targetPanels = await getDocumentLinkPanels(target.id, fixture.user.id);

    expect(sourcePanels.outgoing).toEqual([
      {
        id: expect.any(String),
        targetTitleRaw: "Runbook",
        alias: null,
        isBroken: false,
        targetDocument: { id: target.id, title: "Runbook", slug: "runbook" },
      },
    ]);
    expect(targetPanels.backlinks).toEqual([
      {
        id: expect.any(String),
        sourceDocument: { id: source.id, title: "Incident Guide", slug: "incident-guide" },
      },
    ]);
  });

  it("marks links as broken when the target document does not exist", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Missing Runbook]].",
    });

    const panels = await getDocumentLinkPanels(source.id, fixture.user.id);

    expect(panels.brokenLinks).toEqual([
      {
        id: expect.any(String),
        targetTitleRaw: "Missing Runbook",
        alias: null,
      },
    ]);
  });

  it("replaces outgoing links when a document is updated", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Runbook]].",
    });

    await updateDocument({
      documentId: source.id,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "No links now.",
    });

    await expect(prisma.documentLink.findMany({ where: { sourceDocumentId: source.id } })).resolves.toEqual([]);
  });

  it("keeps existing backlinks connected when a target document is renamed", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });
    await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Runbook]].",
    });

    const renamed = await updateDocument({
      documentId: target.id,
      actorId: fixture.user.id,
      title: "Production Runbook",
      contentMarkdown: "# Production Runbook",
    });

    const targetPanels = await getDocumentLinkPanels(renamed.id, fixture.user.id);
    expect(targetPanels.backlinks).toEqual([
      {
        id: expect.any(String),
        sourceDocument: {
          id: expect.any(String),
          title: "Incident Guide",
          slug: "incident-guide",
        },
      },
    ]);
  });

  it("filters backlinks from restricted source documents", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Restricted Incident Guide",
      contentMarkdown: "Read [[Runbook]].",
    });
    const otherEditor = await prisma.user.create({
      data: { email: `link-editor-${source.id}@example.com`, name: "Link Editor" },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: fixture.workspace.id, userId: otherEditor.id, role: WorkspaceRole.EDITOR },
    });
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: source.id,
        subjectType: "USER",
        subjectId: otherEditor.id,
        permission: "MANAGE",
      },
    });

    const targetPanels = await getDocumentLinkPanels(target.id, fixture.user.id);

    expect(targetPanels.backlinks).toEqual([]);
  });

  it("creates a missing target document from a broken link and repairs the link", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Missing Runbook]].",
    });
    const broken = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id, targetTitleRaw: "Missing Runbook" },
    });

    const created = await createDocumentFromBrokenLink({
      linkId: broken.id,
      actorId: fixture.user.id,
    });

    expect(created.title).toBe("Missing Runbook");
    expect(created.contentMarkdown).toBe("");
    expect(created.path).toBe("/missing-runbook");
    expect(created.parentId).toBeNull();
    const repaired = await prisma.documentLink.findUniqueOrThrow({ where: { id: broken.id } });
    expect(repaired.isBroken).toBe(false);
    expect(repaired.targetDocumentId).toBe(created.id);
  });

  it("prevents viewers from creating a missing target document", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);
    const editor = await prisma.user.create({
      data: { email: `test-editor-${fixture.workspace.id}@example.com`, name: "Editor User" },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: fixture.workspace.id, userId: editor.id, role: WorkspaceRole.EDITOR },
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: editor.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Missing Runbook]].",
    });
    const broken = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id, targetTitleRaw: "Missing Runbook" },
    });

    await expect(
      createDocumentFromBrokenLink({
        linkId: broken.id,
        actorId: fixture.user.id,
      }),
    ).rejects.toThrow("WORKSPACE_WRITE_FORBIDDEN");
  });
});
