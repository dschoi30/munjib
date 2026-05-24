import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createDocument, createDocumentFromBrokenLink, updateDocument } from "@/lib/documents/service";
import { prisma } from "@/lib/db/client";
import { createFolder } from "@/lib/folders/service";
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("wiki link reconciliation", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("stores frontmatter links and backlinks for existing target documents", async () => {
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
      contentMarkdown: `---
links:
  - "[[Runbook]]"
---

Read [[Ignored Content Link]].`,
    });

    const sourcePanels = await getDocumentLinkPanels(source.id, fixture.user.id);
    const targetPanels = await getDocumentLinkPanels(target.id, fixture.user.id);

    expect(sourcePanels.outgoing).toEqual([
      {
        id: expect.any(String),
        targetTitleRaw: "Runbook",
        alias: null,
        isBroken: false,
        isAmbiguous: false,
        targetDocument: { id: target.id, title: "Runbook", slug: "runbook", path: "/runbook" },
      },
    ]);
    expect(targetPanels.backlinks).toEqual([
      {
        id: expect.any(String),
        sourceDocument: {
          id: source.id,
          title: "Incident Guide",
          slug: "incident-guide",
          path: "/incident-guide",
        },
      },
    ]);
  });

  it("marks links as broken when the target document does not exist", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: `---
links:
  - "[[Missing Runbook]]"
---

Read [[Ignored Content Link]].`,
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

  it("preserves frontmatter links order and ignores content wiki links", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const alpha = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Alpha",
      contentMarkdown: "# Alpha",
    });
    const zeta = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Zeta",
      contentMarkdown: "# Zeta",
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Ordered Links",
      contentMarkdown: `---
links:
  - "[[Zeta]]"
  - "[[Alpha]]"
---

Body [[Ignored Content Link]].`,
    });

    const panels = await getDocumentLinkPanels(source.id, fixture.user.id);

    expect(panels.outgoing.map((link) => link.targetTitleRaw)).toEqual(["Zeta", "Alpha"]);
    expect(panels.outgoing.map((link) => link.targetDocument?.id)).toEqual([zeta.id, alpha.id]);
    await expect(
      prisma.documentLink.findFirst({
        where: { sourceDocumentId: source.id, targetTitleRaw: "Ignored Content Link" },
      }),
    ).resolves.toBeNull();
  });

  it("orders link panels by current frontmatter order even when stored rows are stale", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const alpha = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Alpha",
      contentMarkdown: "# Alpha",
    });
    const zeta = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Zeta",
      contentMarkdown: "# Zeta",
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Stale Links",
      contentMarkdown: `---
links:
  - "[[Zeta]]"
  - "[[Alpha]]"
---

Body [[Content Only]].`,
    });
    await prisma.documentLink.updateMany({
      where: { sourceDocumentId: source.id },
      data: { sortOrder: 0 },
    });
    await prisma.documentLink.create({
      data: {
        workspaceId: fixture.workspace.id,
        sourceDocumentId: source.id,
        targetTitleRaw: "Content Only",
        targetDocumentId: null,
        isBroken: true,
        sortOrder: 0,
      },
    });

    const panels = await getDocumentLinkPanels(source.id, fixture.user.id);

    expect(panels.outgoing.map((link) => link.targetTitleRaw)).toEqual(["Zeta", "Alpha"]);
    expect(panels.outgoing.map((link) => link.targetDocument?.id)).toEqual([zeta.id, alpha.id]);
    expect(panels.brokenLinks).toEqual([]);
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
      contentMarkdown: `---
links:
  - "[[Runbook]]"
---

Read [[Ignored Content Link]].`,
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
      contentMarkdown: `---
links:
  - "[[Runbook]]"
---

Read [[Ignored Content Link]].`,
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
          path: "/incident-guide",
        },
      },
    ]);
  });

  it("resolves path-qualified links when duplicate titles exist", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const engineering = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Engineering",
    });
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: operations.id,
      title: "Onboarding",
      contentMarkdown: "",
    });
    await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: engineering.id,
      title: "Onboarding",
      contentMarkdown: "",
    });

    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: "---\nlinks:\n  - \"[[Operations/Onboarding]]\"\n---\n",
    });

    const link = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id },
    });
    expect(link.targetDocumentId).toBe(target.id);
    expect(link.isBroken).toBe(false);
    expect(link.isAmbiguous).toBe(false);
  });

  it("normalizes multi-word path-qualified links before matching", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: operations.id,
      title: "Incident Runbook",
      contentMarkdown: "",
    });

    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: "---\nlinks:\n  - \"[[Operations/Incident Runbook]]\"\n---\n",
    });

    const link = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id },
    });
    expect(link.targetDocumentId).toBe(target.id);
    expect(link.isBroken).toBe(false);
    expect(link.isAmbiguous).toBe(false);
  });

  it("resolves frontmatter underscore targets to document titles with spaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "수에즈 운하 위기",
      contentMarkdown: "",
    });

    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: "---\nlinks:\n  - \"[[수에즈_운하_위기]]\"\n---\n",
    });

    const link = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id },
    });
    expect(link.targetTitleRaw).toBe("수에즈_운하_위기");
    expect(link.targetDocumentId).toBe(target.id);
    expect(link.isBroken).toBe(false);
    expect(link.isAmbiguous).toBe(false);
  });

  it("resolves frontmatter underscore path-qualified targets segment by segment", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const history = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "History",
    });
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: history.id,
      title: "수에즈 운하 위기",
      contentMarkdown: "",
    });

    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: "---\nlinks:\n  - \"[[History/수에즈_운하_위기]]\"\n---\n",
    });

    const link = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id },
    });
    expect(link.targetTitleRaw).toBe("History/수에즈_운하_위기");
    expect(link.targetDocumentId).toBe(target.id);
    expect(link.isBroken).toBe(false);
    expect(link.isAmbiguous).toBe(false);
  });

  it("falls back to title matching when a slash-containing target is not a document path", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Q1/Q2 Plan",
      contentMarkdown: "",
    });

    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: "---\nlinks:\n  - \"[[Q1/Q2 Plan]]\"\n---\n",
    });

    const link = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id },
    });
    expect(link.targetDocumentId).toBe(target.id);
    expect(link.isBroken).toBe(false);
    expect(link.isAmbiguous).toBe(false);
  });

  it("marks title-only duplicate links as ambiguous", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const engineering = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Engineering",
    });
    await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: operations.id,
      title: "Onboarding",
      contentMarkdown: "",
    });
    await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: engineering.id,
      title: "Onboarding",
      contentMarkdown: "",
    });

    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: "---\nlinks:\n  - \"[[Onboarding]]\"\n---\n",
    });

    const link = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id },
    });
    expect(link.targetDocumentId).toBeNull();
    expect(link.isBroken).toBe(false);
    expect(link.isAmbiguous).toBe(true);

    const panels = await getDocumentLinkPanels(source.id, fixture.user.id);
    expect(panels.ambiguousLinks).toEqual([
      {
        id: link.id,
        targetTitleRaw: "Onboarding",
        alias: null,
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
      contentMarkdown: `---
links:
  - "[[Runbook]]"
---

Read [[Ignored Content Link]].`,
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
      contentMarkdown: `---
links:
  - "[[Missing Runbook]]"
---

Read [[Ignored Content Link]].`,
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

  it("creates a missing path-qualified target under the referenced folder", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: `---
links:
  - "[[Operations/Incident Runbook]]"
---`,
    });
    const broken = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id, targetTitleRaw: "Operations/Incident Runbook" },
    });

    const created = await createDocumentFromBrokenLink({
      linkId: broken.id,
      actorId: fixture.user.id,
    });

    expect(created.title).toBe("Incident Runbook");
    expect(created.folderId).toBe(operations.id);
    expect(created.path).toBe("/operations/incident-runbook");

    await updateDocument({
      documentId: source.id,
      actorId: fixture.user.id,
      title: source.title,
      contentMarkdown: source.contentMarkdown,
    });

    const reconciled = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id, targetTitleRaw: "Operations/Incident Runbook" },
    });
    expect(reconciled.isBroken).toBe(false);
    expect(reconciled.targetDocumentId).toBe(created.id);
  });

  it("creates a slash-containing title at root when no parent folder path exists", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Planning Source",
      contentMarkdown: `---
links:
  - "[[Q1/Q2 Plan]]"
---`,
    });
    const broken = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id, targetTitleRaw: "Q1/Q2 Plan" },
    });

    const created = await createDocumentFromBrokenLink({
      linkId: broken.id,
      actorId: fixture.user.id,
    });

    expect(created.title).toBe("Q1/Q2 Plan");
    expect(created.folderId).toBeNull();

    await updateDocument({
      documentId: source.id,
      actorId: fixture.user.id,
      title: source.title,
      contentMarkdown: source.contentMarkdown,
    });

    const reconciled = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id, targetTitleRaw: "Q1/Q2 Plan" },
    });
    expect(reconciled.isBroken).toBe(false);
    expect(reconciled.targetDocumentId).toBe(created.id);
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
      contentMarkdown: `---
links:
  - "[[Missing Runbook]]"
---

Read [[Ignored Content Link]].`,
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
