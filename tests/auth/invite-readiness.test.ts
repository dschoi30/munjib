import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  INVITE_SIGNUP_INVARIANTS,
  INVITE_SIGNUP_PREREQUISITES,
  parseInviteSignupReadinessContract,
} from "@/lib/auth/invite-readiness";

const root = process.cwd();
const contractPath = join(root, "deploy/security/signup/invite-first-readiness-v1.json");

function loadContract(): unknown {
  return JSON.parse(readFileSync(contractPath, "utf8")) as unknown;
}

describe("invite-first signup readiness contract", () => {
  test("parses the checked-in preparation-only contract", () => {
    const contract = parseInviteSignupReadinessContract(loadContract());

    expect(contract).toMatchObject({
      format: "munjib-invite-signup-readiness-v1",
      version: 1,
      leaf: 7,
      state: "PREPARATION_ONLY",
      requestedMode: "invite",
      fallbackMode: "closed",
    });
    expect(contract.prerequisites).toEqual(INVITE_SIGNUP_PREREQUISITES);
    expect(contract.invariants).toEqual(INVITE_SIGNUP_INVARIANTS);
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.prerequisites)).toBe(true);
    expect(Object.isFrozen(contract.invariants)).toBe(true);
    expect(Object.isFrozen(contract.forbiddenOperations)).toBe(true);
  });

  test("rejects an activation claim or changed fallback", () => {
    const contract = loadContract() as Record<string, unknown>;

    expect(() => parseInviteSignupReadinessContract({ ...contract, state: "ACTIVE" })).toThrow(
      /contract\.state/,
    );
    expect(() => parseInviteSignupReadinessContract({ ...contract, fallbackMode: "invite" })).toThrow(
      /contract\.fallbackMode/,
    );
  });

  test("rejects missing, reordered, duplicate, and unknown fields", () => {
    const contract = loadContract() as Record<string, unknown>;
    const prerequisites = [...(contract.prerequisites as string[])];

    expect(() => parseInviteSignupReadinessContract({ ...contract, prerequisites: prerequisites.slice(1) })).toThrow(
      /contract\.prerequisites/,
    );
    expect(() => parseInviteSignupReadinessContract({ ...contract, prerequisites: [...prerequisites].reverse() })).toThrow(
      /contract\.prerequisites/,
    );
    expect(() =>
      parseInviteSignupReadinessContract({ ...contract, prerequisites: [...prerequisites, prerequisites[0]] }),
    ).toThrow(/contract\.prerequisites/);
    const sparsePrerequisites = [...prerequisites];
    delete sparsePrerequisites[2];
    expect(() =>
      parseInviteSignupReadinessContract({ ...contract, prerequisites: sparsePrerequisites }),
    ).toThrow(/contract\.prerequisites/);
    expect(() => parseInviteSignupReadinessContract({ ...contract, capabilitySha256: "a".repeat(64) })).toThrow(
      /unknown field/,
    );
  });

  test("requires own contract keys instead of inheriting them from a prototype", () => {
    const contract = loadContract() as Record<string, unknown>;
    const inherited = Object.create({ forbiddenOperations: contract.forbiddenOperations }) as Record<string, unknown>;
    Object.assign(inherited, contract);
    delete inherited.forbiddenOperations;

    expect(() => parseInviteSignupReadinessContract(inherited)).toThrow(
      /contract\.forbiddenOperations is required/,
    );
  });

  test("rejects mutable or sensitive-looking contract extensions", () => {
    const contract = loadContract() as Record<string, unknown>;

    expect(() => parseInviteSignupReadinessContract({ ...contract, secret: "not-a-secret" })).toThrow(
      /unknown field/,
    );
    expect(() => parseInviteSignupReadinessContract({ ...contract, forbiddenOperations: [] })).toThrow(
      /contract\.forbiddenOperations/,
    );
  });
});
