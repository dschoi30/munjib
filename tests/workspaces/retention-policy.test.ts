import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ARCHIVED_DOCUMENT_RETENTION_POLICIES,
  DEFAULT_ARCHIVED_DOCUMENT_RETENTION_POLICY,
  archivedDocumentRetentionCutoff,
  archivedDocumentRetentionDays,
  archivedDocumentRetentionLabel,
  isArchivedDocumentRetentionPolicy,
  parseArchivedDocumentRetentionPolicy,
} from "@/lib/workspaces/retention-policy";
import { prisma } from "@/lib/db/client";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("archived document retention policy", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("defaults DB-created workspaces to 30 days", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: fixture.workspace.id },
      select: { archivedDocumentRetentionPolicy: true },
    });

    expect(workspace.archivedDocumentRetentionPolicy).toBe("DAYS_30");
  });

  it("exports the default policy", () => {
    expect(DEFAULT_ARCHIVED_DOCUMENT_RETENTION_POLICY).toBe("DAYS_30");
  });

  it("exports retention policies in UI order", () => {
    expect(ARCHIVED_DOCUMENT_RETENTION_POLICIES).toEqual([
      { value: "NEVER", label: "Never", days: null },
      { value: "DAYS_7", label: "7 days", days: 7 },
      { value: "DAYS_30", label: "30 days", days: 30 },
      { value: "DAYS_90", label: "90 days", days: 90 },
    ]);
  });

  it("accepts supported values and rejects unsupported values", () => {
    for (const value of ["NEVER", "DAYS_7", "DAYS_30", "DAYS_90"]) {
      expect(isArchivedDocumentRetentionPolicy(value)).toBe(true);
    }

    for (const value of ["", "DAYS_365", "days_30", 30, null, undefined]) {
      expect(isArchivedDocumentRetentionPolicy(value)).toBe(false);
    }
  });

  it("parses form values and returns null for bad or null values", () => {
    expect(parseArchivedDocumentRetentionPolicy("DAYS_7")).toBe("DAYS_7");
    expect(parseArchivedDocumentRetentionPolicy("DAYS_30")).toBe("DAYS_30");
    expect(parseArchivedDocumentRetentionPolicy("DAYS_365")).toBeNull();
    expect(parseArchivedDocumentRetentionPolicy(null)).toBeNull();
  });

  it("returns labels, days, and cutoffs for retention policies", () => {
    const now = new Date("2026-06-20T00:00:00.000Z");

    expect(archivedDocumentRetentionLabel("DAYS_30")).toBe("30 days");
    expect(archivedDocumentRetentionDays("DAYS_30")).toBe(30);
    expect(archivedDocumentRetentionCutoff("DAYS_30", now)?.toISOString()).toBe(
      "2026-05-21T00:00:00.000Z",
    );

    expect(archivedDocumentRetentionLabel("NEVER")).toBe("Never");
    expect(archivedDocumentRetentionDays("NEVER")).toBeNull();
    expect(archivedDocumentRetentionCutoff("NEVER", now)).toBeNull();
  });
});
