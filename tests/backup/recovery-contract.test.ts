import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  RecoveryContractError,
  parseRecoveryReadinessContract,
  type RecoveryReadinessContract,
} from "../../lib/backup/recovery-contract";

const completeContract = (): RecoveryReadinessContract => ({
  format: "munjib-recovery-readiness-v1",
  version: 1,
  objectives: {
    rpoSeconds: 86400,
    rtoSeconds: 14400,
    retention: { daily: 7, weekly: 4, monthly: 3 },
  },
  phases: {
    phaseA: {
      mode: "MANUAL_ISOLATED",
      required: true,
      dependencies: ["leaf-13-broker-installed"],
    },
    phaseB: {
      mode: "CANDIDATE_ISOLATED",
      required: true,
      dependencies: ["leaf-13b-deployed", "leaf-2-journal-ready", "leaf-9-purge-hooks", "leaf-11-attachment-lifecycle"],
    },
  },
  invariants: [
    "same-quiesced-epoch",
    "ciphertext-before-signature",
    "restore-never-production",
    "no-production-private-key",
    "snapshot-image-is-evidence-only",
  ],
});

describe("encrypted recovery readiness contract", () => {
  test("matches the checked-in public contract artifact", () => {
    const artifact = JSON.parse(
      readFileSync(join(process.cwd(), "deploy/backup/recovery-readiness-v1.json"), "utf8"),
    ) as unknown;

    expect(parseRecoveryReadinessContract(artifact)).toEqual(parseRecoveryReadinessContract(completeContract()));
  });

  test("accepts the dependency-safe public contract and preserves fixed objectives", () => {
    const parsed = parseRecoveryReadinessContract(completeContract());

    expect(parsed.format).toBe("munjib-recovery-readiness-v1");
    expect(parsed.objectives).toEqual({
      rpoSeconds: 86400,
      rtoSeconds: 14400,
      retention: { daily: 7, weekly: 4, monthly: 3 },
    });
    expect(parsed.phases.phaseA.mode).toBe("MANUAL_ISOLATED");
    expect(parsed.phases.phaseB.dependencies).toContain("leaf-2-journal-ready");
  });

  test("rejects unknown keys and sensitive-looking fields at any depth", () => {
    const unknown = { ...completeContract(), unexpected: true };
    expect(() => parseRecoveryReadinessContract(unknown)).toThrow(RecoveryContractError);

    const nestedSecret = {
      ...completeContract(),
      phases: {
        ...completeContract().phases,
        phaseA: { ...completeContract().phases.phaseA, secret: "never" },
      },
    };
    expect(() => parseRecoveryReadinessContract(nestedSecret)).toThrow(/sensitive|unknown/i);
  });

  test("rejects objective drift and invariant drift", () => {
    expect(() =>
      parseRecoveryReadinessContract({
        ...completeContract(),
        objectives: { ...completeContract().objectives, rpoSeconds: 3600 },
      }),
    ).toThrow(/RPO/i);

    expect(() =>
      parseRecoveryReadinessContract({
        ...completeContract(),
        invariants: completeContract().invariants.filter((value) => value !== "restore-never-production"),
      }),
    ).toThrow(/invariant/i);
  });

  test("requires the dependency gates without asserting that they are deployed", () => {
    const parsed = parseRecoveryReadinessContract(completeContract());

    expect(parsed.phases.phaseA.dependencies).toEqual(["leaf-13-broker-installed"]);
    expect(parsed.phases.phaseB.dependencies).toEqual([
      "leaf-13b-deployed",
      "leaf-2-journal-ready",
      "leaf-9-purge-hooks",
      "leaf-11-attachment-lifecycle",
    ]);
    expect(JSON.stringify(parsed)).not.toMatch(/PASS|ACCEPTED|production-ready/i);
  });

  test("rejects non-canonical dependency and invariant ordering", () => {
    const contract = completeContract();
    expect(() =>
      parseRecoveryReadinessContract({
        ...contract,
        phases: {
          ...contract.phases,
          phaseB: {
            ...contract.phases.phaseB,
            dependencies: [...contract.phases.phaseB.dependencies].reverse(),
          },
        },
      }),
    ).toThrow(/order/i);
  });

  test("requires own properties rather than inherited contract fields", () => {
    const inherited = Object.create(completeContract()) as Record<string, unknown>;
    expect(() => parseRecoveryReadinessContract(inherited)).toThrow(/required/i);
  });

  test("rejects sparse dependency and invariant arrays", () => {
    const contract = completeContract();
    const sparseDependencies = new Array(1) as string[];
    expect(() => parseRecoveryReadinessContract({
      ...contract,
      phases: { ...contract.phases, phaseA: { ...contract.phases.phaseA, dependencies: sparseDependencies } },
    })).toThrow(/dense/i);
    const sparseInvariants = new Array(contract.invariants.length) as string[];
    expect(() => parseRecoveryReadinessContract({ ...contract, invariants: sparseInvariants })).toThrow(/dense/i);
  });
});
