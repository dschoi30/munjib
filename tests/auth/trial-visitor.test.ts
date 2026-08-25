import { describe, expect, test } from "vitest";
import {
  deriveTrialVisitorDigest,
  issueTrialVisitorToken,
  verifyTrialVisitorToken,
} from "@/lib/auth/trial-visitor";

const keyring = ["trial-visitor-current-signing-key", "trial-visitor-previous-signing-key"] as const;
const issuedAt = new Date("2026-08-25T00:00:00.000Z");
const visitorDigestKey = "visitor-digest-key";

describe("anonymous trial visitor tokens", () => {
  test("returns only a server-derived pseudonymous subject after token verification", () => {
    const token = issueTrialVisitorToken({
      key: keyring[0],
      now: issuedAt,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xab),
    });
    const verified = verifyTrialVisitorToken(token, keyring, { now: issuedAt, visitorDigestKey });

    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(verified).toEqual({
      ok: true,
      trialVisitorSubject: "59DmwPouq3bgx_RMXdFfuJrpLMvog6v-EOfLJMidtN0",
      issuedAt: "2026-08-25T00:00:00.000Z",
      expiresAt: "2027-02-21T00:00:00.000Z",
    });
    expect(JSON.stringify(verified)).not.toContain("visitorId");
    expect(JSON.stringify(verified)).not.toContain("q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s");
  });

  test("rejects a tampered token without accepting an unsigned fallback", () => {
    const token = issueTrialVisitorToken({ key: keyring[0], now: issuedAt });
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    expect(verifyTrialVisitorToken(tampered, keyring, { now: issuedAt, visitorDigestKey })).toEqual({ ok: false });
  });

  test("rejects an expired token", () => {
    const token = issueTrialVisitorToken({
      key: keyring[0],
      now: issuedAt,
      ttlSeconds: 60,
    });

    expect(verifyTrialVisitorToken(token, keyring, { now: new Date("2026-08-25T00:01:00.000Z"), visitorDigestKey })).toEqual({ ok: false });
  });

  test("rejects a correctly signed token whose issued-at time is in the future", () => {
    const token = issueTrialVisitorToken({
      key: keyring[0],
      now: new Date("2026-08-25T00:00:01.000Z"),
    });

    expect(verifyTrialVisitorToken(token, keyring, { now: issuedAt, visitorDigestKey })).toEqual({ ok: false });
  });

  test("rejects a correctly signed token whose lifetime exceeds 180 days", () => {
    const token = issueTrialVisitorToken({
      key: keyring[0],
      now: issuedAt,
      ttlSeconds: 180 * 24 * 60 * 60 + 1,
    });

    expect(verifyTrialVisitorToken(token, keyring, { now: issuedAt, visitorDigestKey })).toEqual({ ok: false });
  });

  test("accepts the previous verification key during key rotation", () => {
    const token = issueTrialVisitorToken({ key: keyring[1], now: issuedAt });

    expect(verifyTrialVisitorToken(token, keyring, { now: issuedAt, visitorDigestKey })).toMatchObject({ ok: true });
    expect(verifyTrialVisitorToken(token, [keyring[0]], { now: issuedAt, visitorDigestKey })).toEqual({ ok: false });
  });

  test("does not extend rotation beyond the current and immediately previous verification keys", () => {
    const token = issueTrialVisitorToken({ key: "retired-trial-visitor-key", now: issuedAt });

    expect(verifyTrialVisitorToken(token, [...keyring, "retired-trial-visitor-key"], { now: issuedAt, visitorDigestKey })).toEqual({ ok: false });
  });

  test("derives a stable domain-separated digest for an internal random subject", () => {
    const subject = "q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s";

    expect(deriveTrialVisitorDigest(subject, visitorDigestKey)).toBe("59DmwPouq3bgx_RMXdFfuJrpLMvog6v-EOfLJMidtN0");
    expect(deriveTrialVisitorDigest(subject, visitorDigestKey)).not.toBe(subject);
  });

  test("rejects issuance when expiration cannot be represented as a safe integer", () => {
    expect(() => issueTrialVisitorToken({
      key: keyring[0],
      now: new Date("1970-01-01T00:00:01.000Z"),
      ttlSeconds: Number.MAX_SAFE_INTEGER,
    })).toThrow(/ttl/i);
  });
});
