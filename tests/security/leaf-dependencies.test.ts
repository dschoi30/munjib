import { describe, expect, it } from "vitest";
import {
  verifyLeaf2Dependencies,
  type VerifiedLeaf2Dependencies,
} from "@/lib/security/leaf-dependencies";

const sourceDigest = "sha256:" + "a".repeat(64);

const validInput = {
  expectedEnvironment: "production" as const,
  expectedSourceDigest: sourceDigest,
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

describe("Leaf 2 dependencies", () => {
  it("requires the exact deployed Leaf 1 source digest", () => {
    expect(() =>
      verifyLeaf2Dependencies({
        ...validInput,
        leaf1: { ...validInput.leaf1, sourceDigest: "sha256:" + "c".repeat(64) },
      }),
    ).toThrow("LEAF1_SOURCE_DIGEST_MISMATCH");
  });

  it("requires closed Leaf 1 signup and unlinked OAuth proofs", () => {
    expect(() =>
      verifyLeaf2Dependencies({
        ...validInput,
        leaf1: { ...validInput.leaf1, closedPasswordSignup: false },
      }),
    ).toThrow("LEAF1_CLOSED_SIGNUP_REQUIRED");

    expect(() =>
      verifyLeaf2Dependencies({
        ...validInput,
        leaf1: { ...validInput.leaf1, closedUnlinkedOauth: false },
      }),
    ).toThrow("LEAF1_CLOSED_SIGNUP_REQUIRED");
  });

  it("requires the deployed Leaf 13 immutable-delivery capability", () => {
    expect(() =>
      verifyLeaf2Dependencies({
        ...validInput,
        leaf13: { ...validInput.leaf13, sourceDigest: "sha256:" + "c".repeat(64) },
      }),
    ).toThrow("LEAF13_SOURCE_IDENTITY_MISMATCH");

    expect(() =>
      verifyLeaf2Dependencies({
        ...validInput,
        leaf13: { ...validInput.leaf13, rollbackDrillPassed: false },
      }),
    ).toThrow("LEAF13_CAPABILITY_REQUIRED");
  });

  it("returns a branded dependency proof only for a complete exact match", () => {
    const verified: VerifiedLeaf2Dependencies = verifyLeaf2Dependencies(validInput);

    expect(verified).toMatchObject({
      environment: "production",
      sourceDigest,
      databaseRoleCapabilitySha256: "b".repeat(64),
    });
  });

  it("rejects malformed source and role capability digests", () => {
    expect(() =>
      verifyLeaf2Dependencies({
        ...validInput,
        expectedSourceDigest: "a".repeat(64),
      }),
    ).toThrow("LEAF2_SOURCE_DIGEST_INVALID");

    expect(() =>
      verifyLeaf2Dependencies({
        ...validInput,
        leaf13: {
          ...validInput.leaf13,
          databaseRoleCapabilitySha256: "B".repeat(64),
        },
      }),
    ).toThrow("LEAF13_CAPABILITY_REQUIRED");
  });
});
