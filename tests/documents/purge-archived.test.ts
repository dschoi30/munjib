import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rag/index-document", () => ({
  scheduleSavedDocumentIndex: vi.fn(),
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
}));

import { createDocument } from "@/lib/documents/service";
import { purgeExpiredArchivedDocuments } from "@/lib/documents/purge-archived";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

const NOW = new Date("2026-06-20T00:00:00.000Z");

type WorkspaceFixture = Awaited<ReturnType<typeof seedWorkspaceFixture>>;

async function createArchivedDocument(
  fixture: WorkspaceFixture,
  title: string,
  archivedAt: string | null,
) {
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title,
    contentMarkdown: title,
  });

  return prisma.document.update({
    where: { id: document.id },
    data: {
      status: "ARCHIVED",
      archivedAt: archivedAt ? new Date(archivedAt) : null,
    },
  });
}

describe("purgeExpiredArchivedDocuments", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetTestData();
  });

  it("dry-runs expired archived documents without deleting them", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const expired = await createArchivedDocument(fixture, "Expired Plan", "2026-05-01T00:00:00.000Z");
    await createArchivedDocument(fixture, "Fresh Plan", "2026-06-10T00:00:00.000Z");

    const result = await purgeExpiredArchivedDocuments({
      now: NOW,
      dryRun: true,
      workspaceSlug: fixture.workspace.slug,
    });

    expect(result).toEqual({
      dryRun: true,
      totalCount: 1,
      workspaces: [
        {
          workspaceId: fixture.workspace.id,
          workspaceSlug: fixture.workspace.slug,
          count: 1,
        },
      ],
    });
    await expect(prisma.document.findUnique({ where: { id: expired.id } })).resolves.toMatchObject({
      id: expired.id,
      status: "ARCHIVED",
    });
  });

  it("hard deletes only expired archived documents", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const expired = await createArchivedDocument(fixture, "Expired Plan", "2026-05-01T00:00:00.000Z");
    const fresh = await createArchivedDocument(fixture, "Fresh Plan", "2026-06-10T00:00:00.000Z");
    const active = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Active Plan",
      contentMarkdown: "Active Plan",
    });

    const result = await purgeExpiredArchivedDocuments({
      now: NOW,
      workspaceSlug: fixture.workspace.slug,
    });

    expect(result.totalCount).toBe(1);
    await expect(prisma.document.findUnique({ where: { id: expired.id } })).resolves.toBeNull();
    await expect(prisma.document.findUnique({ where: { id: fresh.id } })).resolves.toMatchObject({
      id: fresh.id,
      status: "ARCHIVED",
    });
    await expect(prisma.document.findUnique({ where: { id: active.id } })).resolves.toMatchObject({
      id: active.id,
      status: "ACTIVE",
    });
  });

  it("skips workspaces whose policy is NEVER", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const expired = await createArchivedDocument(fixture, "Expired Plan", "2026-05-01T00:00:00.000Z");
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedDocumentRetentionPolicy: "NEVER" },
    });

    const result = await purgeExpiredArchivedDocuments({
      now: NOW,
      workspaceSlug: fixture.workspace.slug,
    });

    expect(result).toEqual({ dryRun: false, totalCount: 0, workspaces: [] });
    await expect(prisma.document.findUnique({ where: { id: expired.id } })).resolves.toMatchObject({
      id: expired.id,
      status: "ARCHIVED",
    });
  });

  it("skips archived documents whose archivedAt is null", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const archivedWithoutTimestamp = await createArchivedDocument(fixture, "No Archive Time", null);

    const result = await purgeExpiredArchivedDocuments({
      now: NOW,
      workspaceSlug: fixture.workspace.slug,
    });

    expect(result).toEqual({ dryRun: false, totalCount: 0, workspaces: [] });
    await expect(
      prisma.document.findUnique({ where: { id: archivedWithoutTimestamp.id } }),
    ).resolves.toMatchObject({
      id: archivedWithoutTimestamp.id,
      status: "ARCHIVED",
      archivedAt: null,
    });
  });

  it("scopes purge by workspaceSlug", async () => {
    const included = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const excluded = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const includedExpired = await createArchivedDocument(
      included,
      "Included Expired Plan",
      "2026-05-01T00:00:00.000Z",
    );
    const excludedExpired = await createArchivedDocument(
      excluded,
      "Excluded Expired Plan",
      "2026-05-01T00:00:00.000Z",
    );

    const result = await purgeExpiredArchivedDocuments({
      now: NOW,
      workspaceSlug: included.workspace.slug,
    });

    expect(result).toEqual({
      dryRun: false,
      totalCount: 1,
      workspaces: [
        {
          workspaceId: included.workspace.id,
          workspaceSlug: included.workspace.slug,
          count: 1,
        },
      ],
    });
    await expect(prisma.document.findUnique({ where: { id: includedExpired.id } })).resolves.toBeNull();
    await expect(prisma.document.findUnique({ where: { id: excludedExpired.id } })).resolves.toMatchObject({
      id: excludedExpired.id,
      status: "ARCHIVED",
    });
  });

  it("does not treat an empty workspace slug as an unscoped purge", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const expired = await createArchivedDocument(fixture, "Expired Plan", "2026-05-01T00:00:00.000Z");

    await expect(
      purgeExpiredArchivedDocuments({
        now: NOW,
        workspaceSlug: "",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
    await expect(prisma.document.findUnique({ where: { id: expired.id } })).resolves.toMatchObject({
      id: expired.id,
      status: "ARCHIVED",
    });
  });

  it("rejects scoped purge when a workspace slug is ambiguous", async () => {
    const first = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const second = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const firstExpired = await createArchivedDocument(first, "First Expired Plan", "2026-05-01T00:00:00.000Z");
    const secondExpired = await createArchivedDocument(second, "Second Expired Plan", "2026-05-01T00:00:00.000Z");
    await prisma.workspace.update({
      where: { id: second.workspace.id },
      data: { slug: first.workspace.slug },
    });

    await expect(
      purgeExpiredArchivedDocuments({
        now: NOW,
        workspaceSlug: first.workspace.slug,
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_SLUG_AMBIGUOUS);
    await expect(prisma.document.findUnique({ where: { id: firstExpired.id } })).resolves.toMatchObject({
      id: firstExpired.id,
      status: "ARCHIVED",
    });
    await expect(prisma.document.findUnique({ where: { id: secondExpired.id } })).resolves.toMatchObject({
      id: secondExpired.id,
      status: "ARCHIVED",
    });
  });

  it("throws WORKSPACE_NOT_FOUND for an unknown scoped workspace", async () => {
    await expect(
      purgeExpiredArchivedDocuments({
        now: NOW,
        workspaceSlug: "missing-workspace",
      }),
    ).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  });
});
