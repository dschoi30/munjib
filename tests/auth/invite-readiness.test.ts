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

  test("bounds array length before scanning and rejects accessors", () => {
    const contract = loadContract() as Record<string, unknown>;
    const huge = [] as string[];
    huge.length = 0xffffffff;
    expect(() => parseInviteSignupReadinessContract({ ...contract, prerequisites: huge })).toThrow(
      /contract\.prerequisites has a non-canonical length/,
    );

    const accessor = [...(contract.prerequisites as string[])];
    Object.defineProperty(accessor, "0", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("accessor invoked");
      },
    });
    expect(() => parseInviteSignupReadinessContract({ ...contract, prerequisites: accessor })).toThrow(
      /contract\.prerequisites\.0 must be a data property/,
    );
  });

  test("rejects non-enumerable and symbol own contract extensions", () => {
    const contract = loadContract() as Record<string, unknown>;
    const hidden = { ...contract } as Record<string, unknown>;
    Object.defineProperty(hidden, "secret", { value: "not-a-secret", enumerable: false });
    expect(() => parseInviteSignupReadinessContract(hidden)).toThrow(/contract\.secret is an unknown field/);

    const symbol = Symbol("secret");
    const symbolExtended = { ...contract } as Record<string, unknown>;
    Object.defineProperty(symbolExtended, symbol, { value: "not-a-secret", enumerable: false });
    expect(() => parseInviteSignupReadinessContract(symbolExtended)).toThrow(
      /contract\.Symbol\(secret\) is an unknown field/,
    );

    const nestedHidden = { ...contract } as Record<string, unknown>;
    const hiddenPrerequisites = [...(contract.prerequisites as string[])];
    Object.defineProperty(hiddenPrerequisites, "secret", { value: "not-a-secret", enumerable: false });
    nestedHidden.prerequisites = hiddenPrerequisites;
    expect(() => parseInviteSignupReadinessContract(nestedHidden)).toThrow(
      /contract\.prerequisites\.secret is an unknown field/,
    );

    const nestedSymbol = { ...contract } as Record<string, unknown>;
    const symbolPrerequisites = [...(contract.prerequisites as string[])];
    const nestedSecret = Symbol("secret");
    Object.defineProperty(symbolPrerequisites, nestedSecret, { value: "not-a-secret", enumerable: false });
    nestedSymbol.prerequisites = symbolPrerequisites;
    expect(() => parseInviteSignupReadinessContract(nestedSymbol)).toThrow(
      /contract\.prerequisites\.Symbol\(secret\) is an unknown field/,
    );
  });

  test("rejects a caller-controlled iterator extension before copying", () => {
    const contract = loadContract() as Record<string, unknown>;
    const hostilePrerequisites = [...(contract.prerequisites as string[])];
    Object.defineProperty(hostilePrerequisites, Symbol.iterator, {
      configurable: true,
      value: function* () {
        yield* ["attacker-1", "attacker-2", "attacker-3", "attacker-4", "attacker-5"];
      },
    });

    expect(() =>
      parseInviteSignupReadinessContract({
        ...contract,
        prerequisites: hostilePrerequisites,
      }),
    ).toThrow(/contract\.prerequisites\.Symbol\(Symbol\.iterator\) is an unknown field/);
  });
});
