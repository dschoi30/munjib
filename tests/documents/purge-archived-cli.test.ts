import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PurgeExpiredArchivedDocumentsResult } from "@/lib/documents/purge-archived";

vi.mock("@/lib/documents/purge-archived", () => ({
  purgeExpiredArchivedDocuments: vi.fn(),
}));

import { purgeExpiredArchivedDocuments } from "@/lib/documents/purge-archived";
import {
  parsePurgeArchivedDocumentsArgs,
  runPurgeArchivedDocumentsCli,
} from "@/lib/documents/purge-archived-cli";

const mockedPurgeExpiredArchivedDocuments = vi.mocked(purgeExpiredArchivedDocuments);

describe("parsePurgeArchivedDocumentsArgs", () => {
  it("parses dry run and workspace slug options", () => {
    expect(parsePurgeArchivedDocumentsArgs(["--dry-run", "--workspace", "company-handbook"])).toEqual({
      dryRun: true,
      workspaceSlug: "company-handbook",
    });
  });

  it("trims workspace slugs", () => {
    expect(parsePurgeArchivedDocumentsArgs(["--workspace", " company-handbook "])).toEqual({
      dryRun: false,
      workspaceSlug: "company-handbook",
    });
  });

  it("ignores a leading argument separator from package script invocations", () => {
    expect(parsePurgeArchivedDocumentsArgs(["--", "--dry-run"])).toEqual({
      dryRun: true,
    });
  });

  it("rejects unknown flags", () => {
    expect(() => parsePurgeArchivedDocumentsArgs(["--bad-flag"])).toThrow(
      "Unknown argument: --bad-flag",
    );
  });

  it("requires a workspace slug after --workspace", () => {
    expect(() => parsePurgeArchivedDocumentsArgs(["--workspace"])).toThrow(
      "--workspace requires a workspace slug",
    );
    expect(() => parsePurgeArchivedDocumentsArgs(["--workspace", "--dry-run"])).toThrow(
      "--workspace requires a workspace slug",
    );
  });

  it("rejects empty and blank workspace slugs", () => {
    expect(() => parsePurgeArchivedDocumentsArgs(["--workspace", ""])).toThrow(
      "--workspace requires a workspace slug",
    );
    expect(() => parsePurgeArchivedDocumentsArgs(["--workspace", "   "])).toThrow(
      "--workspace requires a workspace slug",
    );
  });
});

describe("runPurgeArchivedDocumentsCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs a purge and logs workspace and total counts", async () => {
    mockedPurgeExpiredArchivedDocuments.mockResolvedValue({
      dryRun: false,
      totalCount: 3,
      workspaces: [
        {
          workspaceId: "workspace-1",
          workspaceSlug: "company-handbook",
          count: 3,
        },
      ],
    } satisfies PurgeExpiredArchivedDocumentsResult);
    const log = vi.fn();

    const result = await runPurgeArchivedDocumentsCli([], log);

    expect(mockedPurgeExpiredArchivedDocuments).toHaveBeenCalledWith({
      dryRun: false,
      workspaceSlug: undefined,
    });
    expect(log).toHaveBeenNthCalledWith(
      1,
      "workspace company-handbook: 3 expired archived documents",
    );
    expect(log).toHaveBeenNthCalledWith(2, "total expired archived documents: 3");
    expect(result.totalCount).toBe(3);
  });

  it("runs a dry-run purge and prefixes log lines", async () => {
    mockedPurgeExpiredArchivedDocuments.mockResolvedValue({
      dryRun: true,
      totalCount: 1,
      workspaces: [
        {
          workspaceId: "workspace-1",
          workspaceSlug: "company-handbook",
          count: 1,
        },
      ],
    } satisfies PurgeExpiredArchivedDocumentsResult);
    const log = vi.fn();

    const result = await runPurgeArchivedDocumentsCli(["--dry-run"], log);

    expect(mockedPurgeExpiredArchivedDocuments).toHaveBeenCalledWith({
      dryRun: true,
      workspaceSlug: undefined,
    });
    expect(log).toHaveBeenNthCalledWith(
      1,
      "dry run: workspace company-handbook: 1 expired archived documents",
    );
    expect(log).toHaveBeenNthCalledWith(2, "dry run: total expired archived documents: 1");
    expect(result.totalCount).toBe(1);
  });
});
