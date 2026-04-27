import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createDocument, updateDocument } from "@/lib/documents/service";
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
});
