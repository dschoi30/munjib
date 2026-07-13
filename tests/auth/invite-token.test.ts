import { describe, expect, test } from "vitest";
import {
  ATTEMPT_SECRET_BYTES,
  INVITATION_BEARER_BYTES,
  compareInvitationBearerHashes,
  createAttemptSecret,
  createInvitationBearer,
  hashAttemptSecret,
  hashInvitationBearer,
  parseAttemptCookie,
  parseInvitationExchangeBody,
  serializeAttemptCookie,
} from "@/lib/auth/invite-token";

const bytes = (value: number): Uint8Array => new Uint8Array(value).fill(0xab);

describe("invite token primitives", () => {
  test("creates a canonical 256-bit invitation bearer without metadata", () => {
    const bearer = createInvitationBearer(() => bytes(INVITATION_BEARER_BYTES));

    expect(bearer).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(bearer).not.toContain("http");
    expect(bearer).not.toContain("/");
  });

  test("hashes invitation bearers with a domain-separated stable digest", () => {
    const bearer = createInvitationBearer(() => bytes(INVITATION_BEARER_BYTES));
    const hash = hashInvitationBearer(bearer);
    const sameHash = hashInvitationBearer(bearer);

    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(sameHash);
    expect(hash).not.toBe(bearer);
    expect(compareInvitationBearerHashes(hash, sameHash)).toBe(true);
    expect(compareInvitationBearerHashes(hash, hashInvitationBearer(createInvitationBearer(() => new Uint8Array(INVITATION_BEARER_BYTES).fill(0xcd))))).toBe(false);
    expect(hashAttemptSecret(createAttemptSecret(() => bytes(ATTEMPT_SECRET_BYTES)))).not.toBe(hash);
  });

  test("rejects malformed or non-canonical invitation bearers without echoing input", () => {
    for (const value of ["", "short", "a".repeat(44), `${"a".repeat(42)}=`, "a".repeat(42) + "/"]) {
      expect(() => hashInvitationBearer(value)).toThrow(/invitation bearer/i);
    }
  });

  test("serializes an attempt cookie as only the opaque 256-bit secret", () => {
    const secret = createAttemptSecret(() => bytes(ATTEMPT_SECRET_BYTES));
    const cookie = serializeAttemptCookie(secret);

    expect(cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie).not.toContain(".");
    expect(cookie).not.toContain("=");
    expect(parseAttemptCookie(cookie)).toBe(secret);
    expect(hashAttemptSecret(secret)).not.toBe(cookie);
  });

  test("rejects cookie values carrying ids, revisions, or attributes", () => {
    const secret = createAttemptSecret(() => bytes(ATTEMPT_SECRET_BYTES));
    const cookie = serializeAttemptCookie(secret);

    for (const value of [`${cookie}.workspace`, `${cookie}; Path=/`, `v1.${cookie}`, `${cookie}:3`]) {
      expect(() => parseAttemptCookie(value)).toThrow(/attempt cookie/i);
    }
  });

  test("accepts only a bounded exact exchange body and returns an immutable raw bearer", () => {
    const bearer = createInvitationBearer(() => bytes(INVITATION_BEARER_BYTES));
    const body = parseInvitationExchangeBody({ bearer });

    expect(body).toEqual({ bearer });
    expect(Object.isFrozen(body)).toBe(true);
    expect(() => parseInvitationExchangeBody({ bearer, workspaceId: "w1" })).toThrow(/unknown field/i);
    expect(() => parseInvitationExchangeBody({ token: bearer })).toThrow(/bearer/i);
    expect(() => parseInvitationExchangeBody({ bearer: `${bearer}x` })).toThrow(/bearer/i);
  });

  test("does not expose raw credentials in the persisted hash envelope", () => {
    const bearer = createInvitationBearer(() => bytes(INVITATION_BEARER_BYTES));
    const attempt = createAttemptSecret(() => bytes(ATTEMPT_SECRET_BYTES));
    const persisted = {
      invitationBearerHash: hashInvitationBearer(bearer),
      attemptSecretHash: hashAttemptSecret(attempt),
    };

    expect(JSON.stringify(persisted)).not.toContain(bearer);
    expect(JSON.stringify(persisted)).not.toContain(attempt);
    expect(Object.keys(persisted)).toEqual(["invitationBearerHash", "attemptSecretHash"]);
  });
});
