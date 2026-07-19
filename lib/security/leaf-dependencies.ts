const SOURCE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CAPABILITY_DIGEST_PATTERN = /^[a-f0-9]{64}$/;

const verifiedLeaf2Dependencies: unique symbol = Symbol("verifiedLeaf2Dependencies");

/**
 * A Leaf 2 operation may only receive this value from the dependency verifier.
 * The brand is intentionally not exported as a runtime value: callers cannot
 * manufacture a proof by casting an unverified deployment envelope.
 */
export type VerifiedLeaf2Dependencies = {
  readonly environment: "production";
  readonly sourceDigest: string;
  readonly databaseRoleCapabilitySha256: string;
  readonly [verifiedLeaf2Dependencies]: true;
};

type Leaf1Proof = {
  environment: string;
  sourceDigest: string;
  closedPasswordSignup: boolean;
  closedUnlinkedOauth: boolean;
};

type Leaf13Proof = {
  environment: string;
  sourceDigest: string;
  immutableDelivery: boolean;
  rollbackDrillPassed: boolean;
  databaseRoleSeparation: boolean;
  databaseRoleCapabilitySha256: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type Leaf2DependencyInput = {
  expectedEnvironment: "production";
  expectedSourceDigest: string;
  leaf1: Leaf1Proof;
  leaf13: Leaf13Proof;
};

/**
 * Verify the immutable deployment proofs required before Leaf 2 can mutate
 * production authentication state. This function validates only the already
 * verified proof fields; signature/trust-anchor verification belongs to the
 * deployment broker and must happen before this boundary is called.
 */
export function verifyLeaf2Dependencies(
  input: Leaf2DependencyInput,
): VerifiedLeaf2Dependencies {
  if (!isRecord(input) || !isRecord(input.leaf1) || !isRecord(input.leaf13)) {
    throw new Error("LEAF2_INPUT_INVALID");
  }

  if (input.expectedEnvironment !== "production") {
    throw new Error("LEAF2_ENVIRONMENT_INVALID");
  }

  if (!SOURCE_DIGEST_PATTERN.test(input.expectedSourceDigest)) {
    throw new Error("LEAF2_SOURCE_DIGEST_INVALID");
  }

  if (input.leaf1.environment !== input.expectedEnvironment) {
    throw new Error("LEAF1_ENVIRONMENT_MISMATCH");
  }
  if (input.leaf1.sourceDigest !== input.expectedSourceDigest) {
    throw new Error("LEAF1_SOURCE_DIGEST_MISMATCH");
  }
  if (input.leaf1.closedPasswordSignup !== true || input.leaf1.closedUnlinkedOauth !== true) {
    throw new Error("LEAF1_CLOSED_SIGNUP_REQUIRED");
  }

  if (
    input.leaf13.environment !== input.expectedEnvironment ||
    input.leaf13.sourceDigest !== input.expectedSourceDigest
  ) {
    throw new Error("LEAF13_SOURCE_IDENTITY_MISMATCH");
  }
  if (
    input.leaf13.immutableDelivery !== true ||
    input.leaf13.rollbackDrillPassed !== true ||
    input.leaf13.databaseRoleSeparation !== true ||
    !CAPABILITY_DIGEST_PATTERN.test(input.leaf13.databaseRoleCapabilitySha256)
  ) {
    throw new Error("LEAF13_CAPABILITY_REQUIRED");
  }

  return {
    environment: "production",
    sourceDigest: input.expectedSourceDigest,
    databaseRoleCapabilitySha256: input.leaf13.databaseRoleCapabilitySha256,
    [verifiedLeaf2Dependencies]: true,
  };
}
