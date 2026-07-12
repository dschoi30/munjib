import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Capability = {
  format: string;
  id: string;
  version: number;
  leaf: number;
  requires: string[];
  evidenceTests: string[];
};

type OwnerMap = {
  format: string;
  version: number;
  release: string;
  artifacts: Array<{
    path: string;
    owner: string;
    version: number;
    sha256: string;
  }>;
};

const capabilityPath = "deploy/security/capabilities/auth-runtime-fail-closed.json";
const ownerMapPath = "deploy/security/protected-artifact-owners.json";

const expectedCapability: Capability = {
  format: "munjib-security-capability-v1",
  id: "auth-runtime-fail-closed",
  version: 1,
  leaf: 1,
  requires: ["secure-next-runtime@1"],
  evidenceTests: [
    "tests/auth/google-existing-account.test.ts",
    "tests/auth/google-token-zero-adapter.test.ts",
    "tests/auth/candidate-persistence-context.test.ts",
    "tests/auth/password-credentials.test.ts",
    "tests/auth/password-work-limit.test.ts",
    "tests/auth/password-rehash-race.test.ts",
    "tests/auth/session-image.test.ts",
    "tests/security/auth-downstream-extension-contract.test.ts",
    "tests/e2e/auth-runtime.spec.ts",
    "tests/security/auth-runtime-capability.test.ts",
  ],
};

const expectedArtifacts = [
  {
    path: "lib/auth/downstream/leaf2.ts",
    owner: "security-journal-auth-tombstones",
  },
  {
    path: "lib/auth/downstream/leaf4.ts",
    owner: "zero-ambient-media-egress",
  },
  {
    path: "lib/auth/downstream/leaf8.ts",
    owner: "issue-08-auth-abuse",
  },
  {
    path: "lib/auth/downstream/leaf7.ts",
    owner: "invite-signup-gate",
  },
] as const;

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Leaf 1 auth runtime capability", () => {
  it("publishes the exact stable capability fragment", () => {
    const capability = JSON.parse(readFileSync(capabilityPath, "utf8")) as Capability;
    expect(capability).toEqual(expectedCapability);
  });

  it("freezes downstream slot ownership at version zero", () => {
    const ownerMap = JSON.parse(readFileSync(ownerMapPath, "utf8")) as OwnerMap;
    expect(ownerMap.format).toBe("munjib-security-protected-artifact-owners-v1");
    expect(ownerMap.version).toBe(1);
    expect(ownerMap.release).toBe("auth-runtime-fail-closed@1");

    expect(ownerMap.artifacts).toHaveLength(expectedArtifacts.length);
    for (const expected of expectedArtifacts) {
      const artifact = ownerMap.artifacts.find((entry) => entry.path === expected.path);
      expect(artifact).toMatchObject({
        path: expected.path,
        owner: expected.owner,
        version: 0,
      });
      expect(artifact?.sha256).toBe(sha256(expected.path));
    }

    const protectedLeaf1Paths = [
      "lib/auth/config.ts",
      "lib/auth/passwords.ts",
      "lib/auth/password-credentials.ts",
      "lib/auth/session-image.ts",
      "lib/auth/closed-signup-adapter.ts",
      "lib/security/strict-secret-file.ts",
    ];
    for (const path of protectedLeaf1Paths) {
      expect(ownerMap.artifacts.some((entry) => entry.path === path)).toBe(false);
    }
  });

  it("declares evidence paths that remain stable for downstream leaves", () => {
    const capability = JSON.parse(readFileSync(capabilityPath, "utf8")) as Capability;
    expect(capability.evidenceTests).toEqual(expectedCapability.evidenceTests);
    expect(capability.evidenceTests).toContain("tests/security/auth-runtime-capability.test.ts");
  });
});
