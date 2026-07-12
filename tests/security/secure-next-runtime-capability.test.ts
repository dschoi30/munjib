import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const expectedCapability = {
  format: "munjib-security-capability-v1",
  id: "secure-next-runtime",
  version: 1,
  leaf: 3,
  requires: [],
  evidenceTests: [
    "tests/security/next-runtime-version.test.ts",
    "tests/security/next-runtime-projection.test.ts",
    "tests/security/next-advisories.test.ts",
    "tests/security/secure-next-runtime-capability.test.ts",
    "tests/e2e/security-runtime.spec.ts",
  ],
};

describe("secure Next.js runtime capability", () => {
  test("commits the canonical capability fragment without candidate assertions", () => {
    const capability = JSON.parse(read("deploy/security/capabilities.d/leaf-03-secure-runtime.json"));
    expect(capability).toEqual(expectedCapability);
    expect(JSON.stringify(capability)).not.toMatch(/digest|passed|assert|candidate/i);
  });

  test("owns the advisory gate, smoke, image, and one projection selector", () => {
    const owners = JSON.parse(read("deploy/security/protected-artifact-owners.json"));
    expect(owners).toMatchObject({
      format: "munjib-protected-artifact-owners-v1",
      version: 1,
    });
    const entries = owners.owners as Array<Record<string, unknown>>;
    const expected = [
      "path:scripts/security/check-next-advisories.ts",
      "path:tests/security/next-advisories.test.ts",
      "path:scripts/test/security-runtime-fixture.ts",
      "path:tests/e2e/security-runtime.spec.ts",
      "path:Dockerfile",
      "path:scripts/test/run-security-runtime-smoke.sh",
      "projection:next-runtime-dependencies-v1",
    ];
    expect(entries.map((entry) => entry.selector)).toEqual(expected);
    expect(entries.every((entry) => entry.owner === "secure-next-runtime" && entry.version === 1)).toBe(true);
    expect(entries.find((entry) => entry.selector === "projection:next-runtime-dependencies-v1")?.kind).toBe("NORMALIZED_PROJECTION");
    expect(entries.filter((entry) => String(entry.selector).includes("package.json") || String(entry.selector).includes("pnpm-lock.yaml"))).toHaveLength(0);
  });

  test("uses exact full paths and rejects globs, aliases, and downstream reservations", () => {
    const owners = JSON.parse(read("deploy/security/protected-artifact-owners.json"));
    const entries = owners.owners as Array<Record<string, unknown>>;
    for (const entry of entries.filter((candidate) => candidate.kind === "FULL_PATH")) {
      expect(entry.selector).toMatch(/^path:[^*?]+$/);
      expect(entry.selector).not.toContain("..");
      expect(entry.selector).not.toContain("alias");
    }
    expect(entries.some((entry) => entry.selector === "projection:next-runtime-dependencies-v1" && entry.kind === "NORMALIZED_PROJECTION")).toBe(true);
    expect(entries.some((entry) => entry.reserved === true)).toBe(false);
  });
});
