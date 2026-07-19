/**
 * Public, dependency-safe readiness contract for the invite-first signup leaf.
 *
 * This parser is intentionally side-effect free. It describes the handoff
 * boundary only; it does not enable signup, read runtime state, or accept a
 * capability as deployed evidence.
 */

export const INVITE_SIGNUP_READINESS_FORMAT = "munjib-invite-signup-readiness-v1" as const;
export const INVITE_SIGNUP_READINESS_VERSION = 1 as const;

export const INVITE_SIGNUP_PREREQUISITES = Object.freeze([
  "auth-runtime-fail-closed@1",
  "security-journal-auth-tombstones@1",
  "issue-08-auth-abuse@1",
  "immutable-private-runtime@1",
  "delivery-broker-attested@1",
] as const);

export const INVITE_SIGNUP_INVARIANTS = Object.freeze([
  "verified-google-identity-only",
  "raw-bearer-never-url-cookie-database-or-log",
  "opaque-attempt-hash-only",
  "atomic-invitation-consumption",
  "no-blind-email-linking",
  "no-owner-invitation-grant",
  "password-signup-remains-closed",
  "private-no-store-responses",
] as const);

export const INVITE_SIGNUP_FORBIDDEN_OPERATIONS = Object.freeze([
  "auth-schema-migration",
  "signup-route-or-middleware-activation",
  "production-mutation",
  "unattested-capability-activation",
] as const);

export type InviteSignupReadinessContract = Readonly<{
  format: typeof INVITE_SIGNUP_READINESS_FORMAT;
  version: typeof INVITE_SIGNUP_READINESS_VERSION;
  leaf: 7;
  state: "PREPARATION_ONLY";
  requestedMode: "invite";
  fallbackMode: "closed";
  prerequisites: readonly (typeof INVITE_SIGNUP_PREREQUISITES[number])[];
  invariants: readonly (typeof INVITE_SIGNUP_INVARIANTS[number])[];
  forbiddenOperations: readonly (typeof INVITE_SIGNUP_FORBIDDEN_OPERATIONS[number])[];
}>;

export class InviteSignupReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteSignupReadinessError";
  }
}

function fail(message: string): never {
  throw new InviteSignupReadinessError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${path} must be an object`);
  }
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const expectedSet = new Set(expected);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !expectedSet.has(key)) {
      fail(`${path}.${String(key)} is an unknown field`);
    }
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`${path}.${key} is required`);
    }
  }
}

function assertLiteral<T extends string | number>(value: unknown, expected: T, path: string): asserts value is T {
  if (value !== expected) {
    fail(`${path} must equal ${JSON.stringify(expected)}`);
  }
}

function assertCanonicalArray<T extends string>(value: unknown, expected: readonly T[], path: string): readonly T[] {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array of strings`);
  }
  const arr: readonly unknown[] = value;
  for (let index = 0; index < arr.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(arr, index)) {
      fail(`${path} must be a dense array`);
    }
  }
  const stringArr: string[] = [];
  for (let index = 0; index < arr.length; index += 1) {
    const item = arr[index];
    if (typeof item !== "string") {
      fail(`${path} must be an array of strings`);
    }
    stringArr.push(item);
  }
  if (stringArr.length !== expected.length || stringArr.some((item, index) => item !== expected[index])) {
    fail(`${path} has a non-canonical order or value`);
  }
  if (new Set(stringArr).size !== stringArr.length) {
    fail(`${path} must not contain duplicates`);
  }
  return Object.freeze(stringArr as T[]);
}

/**
 * Parse the checked-in public contract or a separately loaded copy of it.
 *
 * Returning a fresh immutable value prevents callers from changing the
 * preparation boundary and accidentally making an unattested rollout appear
 * ready. This function never reports production readiness.
 */
export function parseInviteSignupReadinessContract(value: unknown): InviteSignupReadinessContract {
  assertRecord(value, "contract");
  assertExactKeys(
    value,
    [
      "format",
      "version",
      "leaf",
      "state",
      "requestedMode",
      "fallbackMode",
      "prerequisites",
      "invariants",
      "forbiddenOperations",
    ],
    "contract",
  );
  assertLiteral(value["format"], INVITE_SIGNUP_READINESS_FORMAT, "contract.format");
  assertLiteral(value["version"], INVITE_SIGNUP_READINESS_VERSION, "contract.version");
  assertLiteral(value["leaf"], 7, "contract.leaf");
  assertLiteral(value["state"], "PREPARATION_ONLY", "contract.state");
  assertLiteral(value["requestedMode"], "invite", "contract.requestedMode");
  assertLiteral(value["fallbackMode"], "closed", "contract.fallbackMode");

  const prerequisites = assertCanonicalArray(value["prerequisites"], INVITE_SIGNUP_PREREQUISITES, "contract.prerequisites");
  const invariants = assertCanonicalArray(value["invariants"], INVITE_SIGNUP_INVARIANTS, "contract.invariants");
  const forbiddenOperations = assertCanonicalArray(
    value["forbiddenOperations"],
    INVITE_SIGNUP_FORBIDDEN_OPERATIONS,
    "contract.forbiddenOperations",
  );

  return Object.freeze({
    format: INVITE_SIGNUP_READINESS_FORMAT,
    version: INVITE_SIGNUP_READINESS_VERSION,
    leaf: 7,
    state: "PREPARATION_ONLY",
    requestedMode: "invite",
    fallbackMode: "closed",
    prerequisites,
    invariants,
    forbiddenOperations,
  });
}
