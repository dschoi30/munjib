import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
const MINIMUM_SECURE_NEXT_VERSION = "15.5.28";

export function readPinnedVersion(name: string): string {
  const version = packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${name} must use an exact numeric version`);
  }
  return version;
}

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

describe("security-critical Next.js runtime", () => {
  test("pins Next.js and its ESLint config to one secure 15.x patch", () => {
    const nextVersion = readPinnedVersion("next");
    const eslintConfigVersion = readPinnedVersion("eslint-config-next");

    expect(nextVersion.split(".")[0]).toBe("15");
    expect(compareVersions(nextVersion, MINIMUM_SECURE_NEXT_VERSION)).toBeGreaterThanOrEqual(0);
    expect(eslintConfigVersion).toBe(nextVersion);
  });

  test("resolves the pinned runtime and excludes the reviewed vulnerable patch", () => {
    const nextVersion = readPinnedVersion("next");

    expect(lockfile).toContain(`next@${nextVersion}:`);
    expect(lockfile).toContain(`eslint-config-next@${nextVersion}:`);
    expect(lockfile).not.toContain("next@15.5.15:");
  });
});
