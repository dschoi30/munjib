import { describe, expect, test } from "vitest";
import {
  deriveTrialVisitorDigest,
  issueTrialVisitorToken,
  verifyTrialVisitorToken,
} from "@/lib/auth/trial-visitor";

const keyring = ["trial-visitor-current-signing-key", "trial-visitor-previous-signing-key"] as const;
const issuedAt = new Date("2026-08-25T00:00:00.000Z");

describe("anonymous trial visitor tokens", () => {
  test("round-trips a signed 256-bit visitor subject without exposing a raw visitor id", () => {
    const token = issueTrialVisitorToken({
      key: keyring[0],
      now: issuedAt,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xab),
    });
    const verified = verifyTrialVisitorToken(token, keyring, { now: issuedAt });

    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(verified).toEqual({
      ok: true,
      trialVisitorSubject: "q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s",
      issuedAt: "2026-08-25T00:00:00.000Z",
      expiresAt: "2027-02-21T00:00:00.000Z",
    });
    expect(JSON.stringify(verified)).not.toContain("visitorId");
  });

  test("rejects a tampered token without accepting an unsigned fallback", () => {
    const token = issueTrialVisitorToken({ key: keyring[0], now: issuedAt });
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    expect(verifyTrialVisitorToken(tampered, keyring, { now: issuedAt })).toEqual({ ok: false });
  });

  test("rejects an expired token", () => {
    const token = issueTrialVisitorToken({
      key: keyring[0],
      now: issuedAt,
      ttlSeconds: 60,
    });

    expect(verifyTrialVisitorToken(token, keyring, { now: new Date("2026-08-25T00:01:00.000Z") })).toEqual({ ok: false });
  });

  test("accepts the previous verification key during key rotation", () => {
    const token = issueTrialVisitorToken({ key: keyring[1], now: issuedAt });

    expect(verifyTrialVisitorToken(token, keyring, { now: issuedAt })).toMatchObject({ ok: true });
    expect(verifyTrialVisitorToken(token, [keyring[0]], { now: issuedAt })).toEqual({ ok: false });
  });

  test("does not extend rotation beyond the current and immediately previous verification keys", () => {
    const token = issueTrialVisitorToken({ key: "retired-trial-visitor-key", now: issuedAt });

    expect(verifyTrialVisitorToken(token, [...keyring, "retired-trial-visitor-key"], { now: issuedAt })).toEqual({ ok: false });
  });

  test("derives a stable domain-separated digest rather than returning the visitor subject", () => {
    const token = issueTrialVisitorToken({
      key: keyring[0],
      now: issuedAt,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xcd),
    });
    const verified = verifyTrialVisitorToken(token, keyring, { now: issuedAt });
    if (!verified.ok) throw new Error("expected issued token to verify");

    const digest = deriveTrialVisitorDigest(verified.trialVisitorSubject, "visitor-digest-key");

    expect(digest).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).not.toBe(verified.trialVisitorSubject);
    expect(digest).toBe(deriveTrialVisitorDigest(verified.trialVisitorSubject, "visitor-digest-key"));
  });
});
