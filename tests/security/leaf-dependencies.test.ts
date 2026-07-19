import { describe, expect, it } from "vitest";
import {
  verifyLeaf2Dependencies,
  type VerifiedLeaf2Dependencies,
} from "@/lib/security/leaf-dependencies";

const sourceDigest = "sha256:" + "a".repeat(64);

const validInput = {
  expectedEnvironment: "production" as const,
  leaf1: {
    environment: "production",
    sourceDigest,
    closedPasswordSignup: true,
    closedUnlinkedOauth: true,
  },
  leaf13: {
    environment: "production",
    sourceDigest,
    immutableDelivery: true,
    rollbackDrillPassed: true,
    databaseRoleSeparation: true,
    databaseRoleCapabilitySha256: "b".repeat(64),
  },
};

const verify = (input: typeof validInput) => verifyLeaf2Dependencies(input, sourceDigest);

describe("Leaf 2 dependencies", () => {
  it("requires the exact deployed Leaf 1 source digest", () => {
    expect(() =>
      verify({
        ...validInput,
        leaf1: { ...validInput.leaf1, sourceDigest: "sha256:" + "c".repeat(64) },
      }),
    ).toThrow("LEAF1_SOURCE_DIGEST_MISMATCH");
  });

  it("requires closed Leaf 1 signup and unlinked OAuth proofs", () => {
    expect(() =>
      verify({
        ...validInput,
        leaf1: { ...validInput.leaf1, closedPasswordSignup: false },
      }),
    ).toThrow("LEAF1_CLOSED_SIGNUP_REQUIRED");

    expect(() =>
      verify({
        ...validInput,
        leaf1: { ...validInput.leaf1, closedUnlinkedOauth: false },
      }),
    ).toThrow("LEAF1_CLOSED_SIGNUP_REQUIRED");
  });

  it("requires the deployed Leaf 13 immutable-delivery capability", () => {
    expect(() =>
      verify({
        ...validInput,
        leaf13: { ...validInput.leaf13, sourceDigest: "sha256:" + "c".repeat(64) },
      }),
    ).toThrow("LEAF13_SOURCE_IDENTITY_MISMATCH");

    expect(() =>
      verify({
        ...validInput,
        leaf13: { ...validInput.leaf13, rollbackDrillPassed: false },
      }),
    ).toThrow("LEAF13_CAPABILITY_REQUIRED");
  });

  it("returns a branded dependency proof only for a complete exact match", () => {
    const verified: VerifiedLeaf2Dependencies = verify(validInput);

    expect(verified).toMatchObject({
      environment: "production",
      sourceDigest,
      databaseRoleCapabilitySha256: "b".repeat(64),
    });
  });

  it("rejects malformed source and role capability digests", () => {
    expect(() =>
      verifyLeaf2Dependencies(validInput, "a".repeat(64)),
    ).toThrow("LEAF2_SOURCE_DIGEST_INVALID");

    expect(() =>
      verify({
        ...validInput,
        leaf13: {
          ...validInput.leaf13,
          databaseRoleCapabilitySha256: "B".repeat(64),
        },
      }),
    ).toThrow("LEAF13_CAPABILITY_REQUIRED");
  });

  it("rejects nullish or partial parsed input with a controlled error", () => {
    expect(() => verifyLeaf2Dependencies(null as never, sourceDigest)).toThrow("LEAF2_INPUT_INVALID");
    expect(() =>
      verifyLeaf2Dependencies({ ...validInput, leaf1: undefined } as never, sourceDigest),
    ).toThrow("LEAF2_INPUT_INVALID");
    expect(() =>
      verifyLeaf2Dependencies({ ...validInput, leaf13: undefined } as never, sourceDigest),
    ).toThrow("LEAF2_INPUT_INVALID");
  });

  it("pins parsed proof envelopes to the literal production environment", () => {
    expect(() =>
      verifyLeaf2Dependencies({
        ...validInput,
        expectedEnvironment: "staging",
      } as never, sourceDigest),
    ).toThrow("LEAF2_ENVIRONMENT_INVALID");
  });

  it("requires proof flags to be literal booleans", () => {
    expect(() =>
      verify({
        ...validInput,
        leaf1: { ...validInput.leaf1, closedPasswordSignup: "true" },
      } as never),
    ).toThrow("LEAF1_CLOSED_SIGNUP_REQUIRED");

    expect(() =>
      verify({
        ...validInput,
        leaf13: { ...validInput.leaf13, immutableDelivery: "true" },
      } as never),
    ).toThrow("LEAF13_CAPABILITY_REQUIRED");
  });

  it("rejects non-string capability digests before regex coercion", () => {
    expect(() =>
      verify({
        ...validInput,
        leaf13: {
          ...validInput.leaf13,
          databaseRoleCapabilitySha256: ["b".repeat(64)],
        },
      } as never),
    ).toThrow("LEAF13_CAPABILITY_REQUIRED");
  });

  it("requires an independently trusted deployment digest", () => {
    const staleDigest = "sha256:" + "c".repeat(64);
    expect(() =>
      verifyLeaf2Dependencies(
        {
          ...validInput,
          leaf1: { ...validInput.leaf1, sourceDigest: staleDigest },
          leaf13: { ...validInput.leaf13, sourceDigest: staleDigest },
        },
        sourceDigest,
      ),
    ).toThrow("LEAF1_SOURCE_DIGEST_MISMATCH");
  });
});
