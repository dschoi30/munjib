import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  projectNextRuntimeDependencies,
  projectionHash,
} from "../../scripts/deploy/project-protected-artifacts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("canonical Next.js runtime dependency projection", () => {
  test("selects exact roots and a complete sorted reachable lock graph", () => {
    const projection = projectNextRuntimeDependencies({
      packageJsonText: read("package.json"),
      lockfileText: read("pnpm-lock.yaml"),
      ownerMapText: read("deploy/security/protected-artifact-owners.json"),
    });

    expect(projection.selector).toBe("next-runtime-dependencies-v1");
    expect(projection.owner).toBe("secure-next-runtime");
    expect(projection.version).toBe(1);
    expect(projection.status).toBe("ACTIVE");
    expect(projection.roots.map(({ name }) => name)).toEqual(["next", "react", "react-dom"]);
    expect(projection.packages.map(({ key }) => key)).toEqual(
      [...projection.packages.map(({ key }) => key)].sort(),
    );
    expect(projection.snapshots.map(({ key }) => key)).toEqual(
      [...projection.snapshots.map(({ key }) => key)].sort(),
    );
    expect(projection.packages.length).toBeGreaterThanOrEqual(3);
    expect(projection.snapshots.length).toBeGreaterThanOrEqual(3);
    expect(projection.hash).toBe(projectionHash(projection));
  });

  test("ignores unrelated scripts and nonselected root dependencies", () => {
    const original = read("package.json");
    const candidate = JSON.parse(original) as Record<string, unknown>;
    candidate.scripts = { ...(candidate.scripts as Record<string, string>), unrelated: "true" };
    candidate.dependencies = {
      ...(candidate.dependencies as Record<string, string>),
      clsx: "^99.0.0",
    };
    const baseline = projectNextRuntimeDependencies({
      packageJsonText: original,
      lockfileText: read("pnpm-lock.yaml"),
      ownerMapText: read("deploy/security/protected-artifact-owners.json"),
    });
    const changed = projectNextRuntimeDependencies({
      packageJsonText: JSON.stringify(candidate),
      lockfileText: read("pnpm-lock.yaml"),
      ownerMapText: read("deploy/security/protected-artifact-owners.json"),
    });
    expect(changed.hash).toBe(baseline.hash);
  });

  test("rejects ambiguous or incomplete lock graph input", () => {
    const packageText = read("package.json");
    const lockText = read("pnpm-lock.yaml");
    const ownerMapText = read("deploy/security/protected-artifact-owners.json");
    expect(() => projectNextRuntimeDependencies({
      packageJsonText: packageText,
      lockfileText: `${lockText}\nimporters:\n  .: {}`,
      ownerMapText,
    })).toThrow(/lockfile|duplicate|importer/i);
    expect(() => projectNextRuntimeDependencies({
      packageJsonText: packageText,
      lockfileText: lockText.replace("      next:\n", "      missing-next:\n"),
      ownerMapText,
    })).toThrow(/next|root|lock/i);
  });

  test("rejects package and lock ownership while allowing docker-compose ownership", () => {
    const packageText = read("package.json");
    const lockText = read("pnpm-lock.yaml");
    const ownerMap = JSON.parse(read("deploy/security/protected-artifact-owners.json")) as {
      owners: Array<Record<string, unknown>>;
    };
    const wrongOwner = JSON.stringify({
      ...ownerMap,
      owners: ownerMap.owners.map((entry) =>
        entry.selector === "projection:next-runtime-dependencies-v1"
          ? { ...entry, owner: "wrong-owner" }
          : entry,
      ),
    });
    expect(() => projectNextRuntimeDependencies({ packageJsonText: packageText, lockfileText: lockText, ownerMapText: wrongOwner })).toThrow(/owner/i);

    for (const selector of ["path:package.json", "path:pnpm-lock.yaml"]) {
      const wholePathOwner = JSON.stringify({
        ...ownerMap,
        owners: [...ownerMap.owners, { selector, kind: "FULL_PATH", owner: "secure-next-runtime", version: 1 }],
      });
      expect(() => projectNextRuntimeDependencies({ packageJsonText: packageText, lockfileText: lockText, ownerMapText: wholePathOwner })).toThrow(/FULL_PATH|projection source|package\.json|pnpm-lock\.yaml/i);
    }

    const dockerComposeOwner = JSON.stringify({
      ...ownerMap,
      owners: [...ownerMap.owners, { selector: "path:docker-compose.yml", kind: "FULL_PATH", owner: "secure-next-runtime", version: 1 }],
    });
    expect(() => projectNextRuntimeDependencies({ packageJsonText: packageText, lockfileText: lockText, ownerMapText: dockerComposeOwner })).not.toThrow();
  });

  test("rejects a stale hash instead of trusting a candidate assertion", () => {
    expect(() => projectNextRuntimeDependencies({
      packageJsonText: read("package.json"),
      lockfileText: read("pnpm-lock.yaml"),
      ownerMapText: read("deploy/security/protected-artifact-owners.json"),
      expectedHash: "0".repeat(64),
    })).toThrow(/hash.*recomputed/i);
  });
});
