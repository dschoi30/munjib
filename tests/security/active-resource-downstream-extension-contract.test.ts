import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

describe("active-resource downstream slots", () => {
  it("reserves Leaf 6 and Leaf 14 as independent version-zero slots", async () => {
    const owners = JSON.parse(await readFile("deploy/security/protected-artifact-owners.json", "utf8")) as {
      owners: Array<Record<string, unknown>>;
    };
    const leaf6Path = "lib/authorization/downstream/leaf6-document-access.ts";
    const leaf14Path = "lib/retention/downstream/leaf14-production-readiness.ts";
    const leaf6 = owners.owners.find((entry) => entry.selector === `path:${leaf6Path}`);
    const leaf14 = owners.owners.find((entry) => entry.selector === `path:${leaf14Path}`);
    expect(leaf6).toMatchObject({
      kind: "FULL_PATH",
      owner: "document-acl-closure",
      version: 0,
      status: "RESERVED",
      creator: "active-resource-boundaries",
    });
    expect(leaf14).toMatchObject({
      kind: "FULL_PATH",
      owner: "encrypted-recovery-readiness",
      version: 0,
      status: "RESERVED",
      creator: "active-resource-boundaries",
    });
    await expect(sha256(leaf6Path)).resolves.toBe(leaf6?.sha256);
    await expect(sha256(leaf14Path)).resolves.toBe(leaf14?.sha256);
  });

  it("keeps the Leaf 14 production seam fail closed", async () => {
    const seam = await import("@/lib/retention/downstream/leaf14-production-readiness");
    await expect(seam.productionPurgeReadiness.authorizeLogicalBatch({} as never, {} as never)).rejects.toThrow(
      "DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED",
    );
    await expect(seam.productionPurgeReadiness.authorizePhysicalItem({} as never, {} as never)).rejects.toThrow(
      "DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED",
    );
    await expect(seam.productionPurgePhysicalExecutor.executeItem({} as never)).rejects.toThrow(
      "DESTRUCTIVE_PURGE_PHYSICAL_INTEGRATION_NOT_INSTALLED",
    );
  });

  it("keeps the version-zero Leaf 6 slot from granting document access", async () => {
    const leaf6 = await import("@/lib/authorization/downstream/leaf6-document-access");
    await expect(
      leaf6.getLeaf6DocumentAccessForActor({} as never, {
        documentId: "document-id",
        actorId: "actor-id",
      }),
    ).rejects.toThrow("LEAF6_DOCUMENT_ACCESS_AUTHORITY_UNAVAILABLE");
    const source = await readFile("lib/authorization/downstream/leaf6-document-access.ts", "utf8");
    expect(source).not.toContain("db.permission");
  });
});
