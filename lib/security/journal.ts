import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export const SECURITY_JOURNAL_EVENT_KINDS = Object.freeze([
  "AUTH_USER_DISABLED",
  "AUTH_CREDENTIAL_INVALIDATED",
  "AUTH_OAUTH_ACCOUNT_REVOKED",
  "AUTH_SESSION_REVOKED",
  "AUTH_USER_SESSIONS_REVOKED",
  "TRIAL_IDENTITY_QUARANTINED",
  "SUPPORT_ACCESS_REVOKED",
  "SUPPORT_ACCESS_EXPIRED",
  "ORGANIZATION_MEMBERSHIP_REVOKED",
  "WORKSPACE_MEMBERSHIP_REVOKED",
  "WORKSPACE_ARCHIVED",
  "FOLDER_ARCHIVED",
  "DOCUMENT_ARCHIVED",
  "DOCUMENT_PURGED",
  "DOCUMENT_PERMISSION_REDUCED",
  "INVITATION_CREDENTIAL_INVALIDATED",
  "INVITATION_CONSUMED",
  "INVITATION_REVOKED",
  "INVITATION_EXPIRED",
  "AI_SOURCE_ACCESS_REVOKED",
  "AI_HISTORY_REDACTED",
  "AI_DERIVED_DATA_PURGED",
  "AI_EXTERNAL_PROVIDER_DISABLED",
  "ATTACHMENT_QUARANTINED",
  "ATTACHMENT_DELETE_REQUESTED",
  "ATTACHMENT_DELETED",
] as const);

export type SecurityJournalEventKind = (typeof SECURITY_JOURNAL_EVENT_KINDS)[number];

const SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND_VALUES = {
  AUTH_USER_DISABLED: ["USER"],
  AUTH_CREDENTIAL_INVALIDATED: ["USER"],
  AUTH_OAUTH_ACCOUNT_REVOKED: ["OAUTH_ACCOUNT"],
  AUTH_SESSION_REVOKED: ["AUTH_SESSION"],
  AUTH_USER_SESSIONS_REVOKED: ["USER"],
  TRIAL_IDENTITY_QUARANTINED: ["USER"],
  SUPPORT_ACCESS_REVOKED: ["SUPPORT_GRANT"],
  SUPPORT_ACCESS_EXPIRED: ["SUPPORT_GRANT"],
  ORGANIZATION_MEMBERSHIP_REVOKED: ["ORGANIZATION_MEMBERSHIP"],
  WORKSPACE_MEMBERSHIP_REVOKED: ["WORKSPACE_MEMBERSHIP"],
  WORKSPACE_ARCHIVED: ["WORKSPACE"],
  FOLDER_ARCHIVED: ["FOLDER"],
  DOCUMENT_ARCHIVED: ["DOCUMENT"],
  DOCUMENT_PURGED: ["DOCUMENT"],
  DOCUMENT_PERMISSION_REDUCED: ["DOCUMENT_PERMISSION"],
  INVITATION_CREDENTIAL_INVALIDATED: ["INVITATION"],
  INVITATION_CONSUMED: ["INVITATION"],
  INVITATION_REVOKED: ["INVITATION"],
  INVITATION_EXPIRED: ["INVITATION"],
  AI_SOURCE_ACCESS_REVOKED: ["AI_SOURCE_ACCESS"],
  AI_HISTORY_REDACTED: ["AI_CHAT_TURN", "AI_CHAT_MEMORY"],
  AI_DERIVED_DATA_PURGED: ["AI_DERIVED_DATA"],
  AI_EXTERNAL_PROVIDER_DISABLED: ["WORKSPACE"],
  ATTACHMENT_QUARANTINED: ["ATTACHMENT"],
  ATTACHMENT_DELETE_REQUESTED: ["ATTACHMENT"],
  ATTACHMENT_DELETED: ["ATTACHMENT"],
} as const;

for (const subjectTypes of Object.values(SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND_VALUES)) {
  Object.freeze(subjectTypes);
}

export const SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND = Object.freeze(
  SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND_VALUES,
);

export type SecurityJournalSubjectTypeByKind = {
  [K in SecurityJournalEventKind]: (typeof SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND)[K][number];
};

export type SecurityJournalPayload<K extends SecurityJournalEventKind> = Readonly<{
  stateCode: K;
  stateVersion: 1;
}>;

export type SecurityJournalEventInput = {
  [K in SecurityJournalEventKind]: Readonly<{
    kind: K;
    subjectType: SecurityJournalSubjectTypeByKind[K];
    subjectId: string;
    operationId: string;
    payload: SecurityJournalPayload<K>;
  }>;
}[SecurityJournalEventKind];

export type SecurityJournalOperationTarget = {
  [K in SecurityJournalEventKind]: Readonly<{
    rootOperationId: string;
    kind: K;
    subjectType: SecurityJournalSubjectTypeByKind[K];
    subjectId: string;
  }>;
}[SecurityJournalEventKind];

export type SecurityJournalEvent = {
  [K in SecurityJournalEventKind]: Readonly<{
    schemaVersion: 1;
    sequence: string;
    occurredAt: string;
    previousHash: string;
    eventHash: string;
    kind: K;
    subjectType: SecurityJournalSubjectTypeByKind[K];
    subjectId: string;
    operationId: string;
    payload: SecurityJournalPayload<K>;
  }>;
}[SecurityJournalEventKind];

declare const verifiedJournalReplayContext: unique symbol;

/** Branded context produced only after an isolated restore envelope is verified. */
export type VerifiedJournalReplayContext = Readonly<{
  mode: "isolated-restore";
  sourceEnvelopeSha256: string;
  highWaterSequence: string;
  [verifiedJournalReplayContext]: true;
}>;

export type SecurityJournalReplayReducer<K extends SecurityJournalEventKind> = (
  tx: Prisma.TransactionClient,
  event: Extract<SecurityJournalEvent, { kind: K }>,
  context: VerifiedJournalReplayContext,
) => Promise<void>;

/** Repository-pinned namespace for deterministic journal operation UUIDs. */
export const SECURITY_JOURNAL_OPERATION_NAMESPACE = "0f7b3d90-0a7a-5f28-9a0d-7e2c9a1c6d40";

const MAX_INT64 = BigInt("9223372036854775807");
const TEXT_ENCODER = new TextEncoder();
const EVENT_KEY_SET = [
  "schemaVersion",
  "sequence",
  "occurredAt",
  "previousHash",
  "eventHash",
  "kind",
  "subjectType",
  "subjectId",
  "operationId",
  "payload",
] as const;
const PAYLOAD_KEY_SET = ["stateCode", "stateVersion"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const OCCURRED_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], error: string) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(error);
  }
}

function utf8Bytes(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function assertSubjectId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    utf8Bytes(value) < 1 ||
    utf8Bytes(value) > 191 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("SECURITY_JOURNAL_SUBJECT_ID_INVALID");
  }
}

function assertCanonicalUuid(value: unknown, error = "SECURITY_JOURNAL_OPERATION_ID_INVALID"): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(error);
}

function assertHash(value: unknown, error: string): asserts value is string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error(error);
}

function parseSequence(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error("SECURITY_JOURNAL_SEQUENCE_INVALID");
  }
  let sequence: bigint;
  try {
    sequence = BigInt(value);
  } catch {
    throw new Error("SECURITY_JOURNAL_SEQUENCE_INVALID");
  }
  if (sequence < BigInt(1) || sequence > MAX_INT64) throw new Error("SECURITY_JOURNAL_SEQUENCE_INVALID");
  return value;
}

function assertOccurredAt(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new Error("SECURITY_JOURNAL_OCCURRED_AT_INVALID");
  const match = OCCURRED_AT_PATTERN.exec(value);
  if (!match) throw new Error("SECURITY_JOURNAL_OCCURRED_AT_INVALID");
  const millis = `${value.slice(0, 23)}Z`;
  const parsed = new Date(millis);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== millis) {
    throw new Error("SECURITY_JOURNAL_OCCURRED_AT_INVALID");
  }
}

function isEventKind(value: unknown): value is SecurityJournalEventKind {
  return typeof value === "string" && (SECURITY_JOURNAL_EVENT_KINDS as readonly string[]).includes(value);
}

function assertKind(value: unknown): asserts value is SecurityJournalEventKind {
  if (!isEventKind(value)) throw new Error("SECURITY_JOURNAL_KIND_INVALID");
}

function assertPayload<K extends SecurityJournalEventKind>(
  value: unknown,
  kind: K,
): asserts value is SecurityJournalPayload<K> {
  if (!isRecord(value)) throw new Error("SECURITY_JOURNAL_PAYLOAD_OBJECT_REQUIRED");
  exactKeys(value, PAYLOAD_KEY_SET, "SECURITY_JOURNAL_PAYLOAD_KEYS_INVALID");
  if (value.stateCode !== kind || typeof value.stateCode !== "string") {
    throw new Error("SECURITY_JOURNAL_STATE_CODE_INVALID");
  }
  if (value.stateVersion !== 1 || typeof value.stateVersion !== "number") {
    throw new Error("SECURITY_JOURNAL_STATE_VERSION_INVALID");
  }
  if (utf8Bytes(JSON.stringify(value)) > 96) throw new Error("SECURITY_JOURNAL_PAYLOAD_TOO_LARGE");
}

function assertSubjectType<K extends SecurityJournalEventKind>(
  value: unknown,
  kind: K,
): asserts value is SecurityJournalSubjectTypeByKind[K] {
  const allowed = SECURITY_JOURNAL_SUBJECT_TYPE_BY_KIND[kind] as readonly string[];
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error("SECURITY_JOURNAL_SUBJECT_TYPE_INVALID");
  }
}

function validateEventInput(input: SecurityJournalEventInput): SecurityJournalEventInput {
  if (!isRecord(input)) throw new Error("SECURITY_JOURNAL_EVENT_INPUT_INVALID");
  assertKind(input.kind);
  assertSubjectType(input.subjectType, input.kind);
  assertSubjectId(input.subjectId);
  assertCanonicalUuid(input.operationId);
  assertPayload(input.payload, input.kind);
  return input;
}

function hexToBytes(value: string, error: string): Uint8Array {
  assertHash(value, error);
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function uuidToBytes(value: string): Uint8Array {
  assertCanonicalUuid(value);
  return Uint8Array.from(Buffer.from(value.replaceAll("-", ""), "hex"));
}

function lengthPrefix(value: string): Uint8Array {
  const bytes = TEXT_ENCODER.encode(value);
  if (bytes.byteLength > 0xffff_ffff) throw new Error("SECURITY_JOURNAL_FIELD_TOO_LARGE");
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, bytes.byteLength, false);
  return concatBytes(prefix, bytes);
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function bigintBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, false);
  return bytes;
}

function canonicalSequenceBytes(sequence: string) {
  return bigintBytes(BigInt(parseSequence(sequence)));
}

export function parseSecurityJournalEvent(value: unknown): SecurityJournalEvent {
  if (!isRecord(value)) throw new Error("SECURITY_JOURNAL_EVENT_OBJECT_REQUIRED");
  exactKeys(value, EVENT_KEY_SET, "SECURITY_JOURNAL_EVENT_KEYS_INVALID");
  if (value.schemaVersion !== 1 || typeof value.schemaVersion !== "number") {
    throw new Error("SECURITY_JOURNAL_SCHEMA_VERSION_INVALID");
  }
  const sequence = parseSequence(value.sequence);
  assertOccurredAt(value.occurredAt);
  assertHash(value.previousHash, "SECURITY_JOURNAL_PREVIOUS_HASH_INVALID");
  assertHash(value.eventHash, "SECURITY_JOURNAL_EVENT_HASH_INVALID");
  assertKind(value.kind);
  assertSubjectType(value.subjectType, value.kind);
  assertSubjectId(value.subjectId);
  assertCanonicalUuid(value.operationId);
  assertPayload(value.payload, value.kind);
  return value as SecurityJournalEvent;
}

export function encodeSecurityJournalHashPreimage(event: SecurityJournalEvent): Uint8Array {
  const parsed = parseSecurityJournalEvent(event);
  return concatBytes(
    TEXT_ENCODER.encode("munjib-security-journal-event-v1\0"),
    hexToBytes(parsed.previousHash, "SECURITY_JOURNAL_PREVIOUS_HASH_INVALID"),
    canonicalSequenceBytes(parsed.sequence),
    lengthPrefix(parsed.kind),
    lengthPrefix(parsed.subjectType),
    lengthPrefix(parsed.subjectId),
    lengthPrefix(parsed.operationId),
    lengthPrefix(parsed.occurredAt),
    lengthPrefix(parsed.payload.stateCode),
    Uint8Array.of(1),
  );
}

export function recomputeSecurityJournalEventHash(event: SecurityJournalEvent): string {
  return createHash("sha256").update(encodeSecurityJournalHashPreimage(event)).digest("hex");
}

export function deriveSecurityJournalOperationId(input: SecurityJournalOperationTarget): string {
  const validated = validateEventInput({
    kind: input.kind,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    operationId: input.rootOperationId,
    payload: { stateCode: input.kind, stateVersion: 1 },
  } as SecurityJournalEventInput);
  const namespace = uuidToBytes(SECURITY_JOURNAL_OPERATION_NAMESPACE);
  const name = concatBytes(
    lengthPrefix(validated.operationId),
    lengthPrefix(validated.kind),
    lengthPrefix(validated.subjectType),
    lengthPrefix(validated.subjectId),
  );
  const digest = createHash("sha1").update(namespace).update(name).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function appendSecurityJournalEvent(
  tx: Prisma.TransactionClient | PrismaClient,
  input: SecurityJournalEventInput,
): Promise<{ sequence: bigint; eventHash: string }> {
  const validated = validateEventInput(input);
  const rows = await tx.$queryRaw<Array<{ sequence: bigint; eventHash: string }>>(Prisma.sql`
    SELECT sequence, event_hash AS "eventHash"
    FROM public.security_journal_append(
      ${validated.kind},
      ${validated.subjectType},
      ${validated.subjectId},
      ${validated.operationId}::uuid,
      ${JSON.stringify(validated.payload)}::jsonb
    )
  `);
  const row = rows[0];
  if (!row || typeof row.sequence !== "bigint" || !HASH_PATTERN.test(row.eventHash)) {
    throw new Error("SECURITY_JOURNAL_APPEND_RESULT_INVALID");
  }
  return { sequence: row.sequence, eventHash: row.eventHash };
}
