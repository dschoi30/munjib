import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  SECURITY_JOURNAL_EVENT_KINDS,
  SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND,
  appendSecurityJournalEvent,
  deriveSecurityJournalOperationId,
  encodeSecurityJournalHashPreimage,
  parseSecurityJournalEvent,
  recomputeSecurityJournalEventHash,
  type SecurityJournalEvent,
} from "@/lib/security/journal";

const operationId = "11111111-1111-4111-8111-111111111111";
const previousHash = "00".repeat(32);

function event(overrides: Record<string, unknown> = {}): SecurityJournalEvent {
  return {
    schemaVersion: 1,
    sequence: "9007199254740993",
    occurredAt: "2026-07-13T01:02:03.123456Z",
    previousHash,
    eventHash: "11".repeat(32),
    kind: "TRIAL_IDENTITY_QUARANTINED",
    subjectType: "USER",
    subjectId: "user-opaque-id",
    operationId,
    payload: { stateCode: "TRIAL_IDENTITY_QUARANTINED", stateVersion: 1 },
    ...overrides,
  } as SecurityJournalEvent;
}

describe("security journal contract", () => {
  it("publishes the closed canonical kind set", () => {
    expect(SECURITY_JOURNAL_EVENT_KINDS).toContain("AUTH_USER_DISABLED");
    expect(SECURITY_JOURNAL_EVENT_KINDS).toContain("TRIAL_IDENTITY_QUARANTINED");
    expect(SECURITY_JOURNAL_EVENT_KINDS).toHaveLength(26);
  });

  it("deep-freezes the subject-type contract", () => {
    expect(Object.isFrozen(SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND)).toBe(true);
    expect(Object.isFrozen(SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND.AI_HISTORY_REDACTED)).toBe(true);
    expect(() => {
      (SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND.AI_HISTORY_REDACTED as unknown as string[]).push(
        "WORKSPACE",
      );
    }).toThrow(TypeError);
    expect(SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND.AI_HISTORY_REDACTED).toEqual([
      "AI_CHAT_TURN",
      "AI_CHAT_MEMORY",
    ]);
  });

  it("parses an exact JSON-safe event without converting BIGINT sequence", () => {
    const parsed = parseSecurityJournalEvent(event());
    expect(parsed).toEqual(event());
    expect(typeof parsed.sequence).toBe("string");
    expect(parsed).not.toHaveProperty("date");
  });

  it("rejects unknown keys, noncanonical encodings, and kind/payload mismatches", () => {
    expect(() => parseSecurityJournalEvent({ ...event(), extra: true })).toThrow(
      "SECURITY_JOURNAL_EVENT_KEYS_INVALID",
    );
    expect(() => parseSecurityJournalEvent({ ...event(), sequence: "01" })).toThrow(
      "SECURITY_JOURNAL_SEQUENCE_INVALID",
    );
    expect(() => parseSecurityJournalEvent({
      ...event(),
      payload: { stateCode: "AUTH_USER_DISABLED", stateVersion: 1 },
    })).toThrow("SECURITY_JOURNAL_STATE_CODE_INVALID");
    expect(() => parseSecurityJournalEvent({
      ...event(),
      subjectType: "WORKSPACE",
    })).toThrow("SECURITY_JOURNAL_SUBJECT_TYPE_INVALID");
  });

  it("derives one stable UUID per root/kind/target tuple", () => {
    const target = {
      rootOperationId: operationId,
      kind: "TRIAL_IDENTITY_QUARANTINED" as const,
      subjectType: "USER" as const,
      subjectId: "user-opaque-id",
    };
    const derived = deriveSecurityJournalOperationId(target);
    expect(derived).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(derived).toBe(deriveSecurityJournalOperationId(target));
    expect(derived).not.toBe(deriveSecurityJournalOperationId({ ...target, subjectId: "other" }));
  });

  it("matches the language-independent preimage and SHA-256 helper", () => {
    const parsed = parseSecurityJournalEvent(event());
    const preimage = encodeSecurityJournalHashPreimage(parsed);
    const header = "munjib-security-journal-event-v1\0";
    expect(Buffer.from(preimage).subarray(0, Buffer.byteLength(header)).toString("utf8")).toBe(header);
    expect(recomputeSecurityJournalEventHash(parsed)).toBe(
      createHash("sha256").update(preimage).digest("hex"),
    );
  });

  it("calls only the fixed database append function after validating input", async () => {
    const query = async () => [{ sequence: BigInt(7), eventHash: "22".repeat(32) }];
    const tx = { $queryRaw: query } as never;
    await expect(appendSecurityJournalEvent(tx, {
      kind: "TRIAL_IDENTITY_QUARANTINED",
      subjectType: "USER",
      subjectId: "user-opaque-id",
      operationId,
      payload: { stateCode: "TRIAL_IDENTITY_QUARANTINED", stateVersion: 1 },
    })).resolves.toEqual({ sequence: BigInt(7), eventHash: "22".repeat(32) });
  });

  it.each([
    { rows: [] },
    { rows: [{ sequence: BigInt(0), eventHash: "22".repeat(32) }] },
    { rows: [{ sequence: BigInt(-1), eventHash: "22".repeat(32) }] },
    { rows: [{ sequence: BigInt(1), eventHash: Buffer.from("2".repeat(64)) }] },
    { rows: [
      { sequence: BigInt(1), eventHash: "22".repeat(32) },
      { sequence: BigInt(2), eventHash: "33".repeat(32) },
    ] },
  ])("rejects malformed append result %#", async ({ rows }) => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue(rows) } as never;
    await expect(appendSecurityJournalEvent(tx, {
      kind: "TRIAL_IDENTITY_QUARANTINED",
      subjectType: "USER",
      subjectId: "user-opaque-id",
      operationId,
      payload: { stateCode: "TRIAL_IDENTITY_QUARANTINED", stateVersion: 1 },
    })).rejects.toThrow("SECURITY_JOURNAL_APPEND_RESULT_INVALID");
  });
});
