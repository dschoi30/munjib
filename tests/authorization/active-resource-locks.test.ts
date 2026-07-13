import { describe, expect, it } from "vitest";
import {
  lockActorArchiveBoundary,
  lockDocumentBoundary,
  lockFolderBoundaries,
  lockWorkspaceBoundary,
} from "@/lib/authorization/active-resource-locks";

function fakeTx(rows: unknown[]) {
  const calls: unknown[] = [];
  return {
    calls,
    tx: {
      $queryRaw: async (query: unknown) => {
        calls.push(query);
        return rows.shift() ?? [];
      },
    } as never,
  };
}

describe("active-resource lock order", () => {
  it("uses an actor-scoped advisory transaction lock", async () => {
    const { tx, calls } = fakeTx([[]]);
    await lockActorArchiveBoundary(tx, "actor-id");
    expect(calls).toHaveLength(1);
    expect((calls[0] as { strings?: string[] }).strings?.join(""))
      .toContain("munjib-archive-actor-v1:");
  });

  it("locks an active workspace row and rejects an archived row", async () => {
    const { tx } = fakeTx([[{ id: "workspace-id", archivedAt: null }]]);
    await expect(lockWorkspaceBoundary(tx, "workspace-id")).resolves.toEqual({
      id: "workspace-id",
      archivedAt: null,
    });

    const archived = fakeTx([[{ id: "workspace-id", archivedAt: new Date() }]]);
    await expect(lockWorkspaceBoundary(archived.tx, "workspace-id")).rejects.toThrow(
      "WORKSPACE_NOT_FOUND",
    );
  });

  it("sorts and deduplicates folder ids before locking", async () => {
    const { tx, calls } = fakeTx([
      [
        { id: "folder-a", archivedAt: null },
        { id: "folder-b", archivedAt: null },
      ],
    ]);
    await expect(
      lockFolderBoundaries(tx, "workspace-id", ["folder-b", "folder-a", "folder-b"]),
    ).resolves.toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it("locks only an active document belonging to the already locked workspace", async () => {
    const { tx } = fakeTx([
      [
        {
          documentId: "document-id",
          workspaceId: "workspace-id",
          status: "ACTIVE",
          documentArchivedAt: null,
        },
      ],
    ]);
    await expect(lockDocumentBoundary(tx, "document-id", "workspace-id")).resolves.toMatchObject({
      documentId: "document-id",
    });
  });
});
