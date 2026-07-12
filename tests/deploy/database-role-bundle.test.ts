import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("database-role-v1 host bundle", () => {
  it("contains only manifest-listed fixed artifacts with explicit type/hash/mode/destination", () => {
    const manifest = JSON.parse(read("deploy/host-bundles/database-role-v1/manifest.json")) as {
      format: string;
      version: number;
      bundle: string;
      files: Array<{ source: string; destination: string; type: string; mode: string; sha256: string }>;
    };
    expect(manifest).toMatchObject({
      format: "munjib-database-role-bundle-v1",
      version: 1,
      bundle: "database-role-v1",
    });
    expect(manifest.files.map((file) => file.source)).toEqual([
      "deploy/postgres/roles-only.sql",
      "deploy/postgres/finalize-ownership.sql",
      "deploy/postgres/verify-role-separation.sql",
    ]);
    for (const file of manifest.files) {
      expect(file.type).toBe("regular");
      expect(file.mode).toMatch(/^0[46]00$/);
      expect(file.destination).toMatch(/^\/var\/lib\/munjib\/database-role-v1\//);
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("builds from the manifest and refuses checkout-selected paths or privileged execution", () => {
    const source = read("scripts/deploy/build-database-role-bundle.ts");
    expect(source).toContain("database-role-v1/manifest.json");
    expect(source).toContain("sha256");
    expect(source).toContain("manifest.files");
    expect(source).toContain("regular");
    expect(source).toMatch(/mode.*0400|0400.*mode/);
    expect(source).not.toMatch(/process\.argv\.slice|checkout|git\s+(show|archive)|exec\.Command|sudo|docker/i);
  });

  it("keeps PRE_JOURNAL evidence explicit and free of journal genesis", () => {
    const manifest = read("deploy/host-bundles/database-role-v1/manifest.json");
    expect(manifest).toContain("PRE_JOURNAL");
    expect(manifest).toContain("pg_catalog");
    expect(manifest).not.toMatch(/pgcrypto|security_journal|genesis/i);
  });
});
