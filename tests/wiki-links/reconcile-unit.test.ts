import { describe, expect, it } from "vitest";
import { reconcileDocumentLinks } from "@/lib/wiki-links/reconcile";

describe("reconcileDocumentLinks batching", () => {
  it("fetches targets once and inserts links with createMany", async () => {
    const calls = {
      deleteMany: 0,
      findMany: 0,
      createMany: 0,
      create: 0,
      findFirst: 0,
    };
    const createdRows: unknown[] = [];
    const tx = {
      documentLink: {
        deleteMany: async () => {
          calls.deleteMany += 1;
        },
        createMany: async ({ data }: { data: unknown[] }) => {
          calls.createMany += 1;
          createdRows.push(...data);
        },
        create: async () => {
          calls.create += 1;
        },
      },
      document: {
        findMany: async () => {
          calls.findMany += 1;
          return [{ id: "runbook-id", path: "/runbook", title: "Runbook" }];
        },
        findFirst: async () => {
          calls.findFirst += 1;
          return null;
        },
      },
    };

    await reconcileDocumentLinks(tx as never, {
      workspaceId: "workspace-id",
      sourceDocumentId: "source-id",
      contentMarkdown: "---\nlinks:\n  - \"[[Runbook]]\"\n  - \"[[Missing Policy]]\"\n  - \"[[Runbook]]\"\n---\n\n# Source",
    });

    expect(calls).toEqual({
      deleteMany: 1,
      findMany: 1,
      createMany: 1,
      create: 0,
      findFirst: 0,
    });
    expect(createdRows).toEqual([
      {
        workspaceId: "workspace-id",
        sourceDocumentId: "source-id",
        targetDocumentId: "runbook-id",
        targetTitleRaw: "Runbook",
        alias: null,
        isBroken: false,
        isAmbiguous: false,
        sortOrder: 0,
      },
      {
        workspaceId: "workspace-id",
        sourceDocumentId: "source-id",
        targetDocumentId: null,
        targetTitleRaw: "Missing Policy",
        alias: null,
        isBroken: true,
        isAmbiguous: false,
        sortOrder: 1,
      },
    ]);
  });
});
