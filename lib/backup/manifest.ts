import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The manifest is intentionally a data-only boundary.  It does not open a
 * database, read an attachment, contact an object store, or select a restore
 * image.  A later capture/restore implementation must provide the receipts
 * consumed by the integrity helpers below.
 */

export const SNAPSHOT_MANIFEST_FORMAT = "munjib-snapshot-manifest-v2" as const;
export const SNAPSHOT_ENVELOPE_FORMAT = "munjib-snapshot-envelope-v2" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const COMMIT = /^[a-f0-9]{7,64}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const MAX_DECIMAL_DIGITS = 39;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NONCE = /^[a-f0-9]{64}$/;
const GENERATION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MAX_JOURNAL_SEQUENCE = BigInt("9223372036854775807");
const MAX_NESTED_DEPTH = 64;
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*(?:^|\/)\.(?:\/|$))(?!.*\/$)(?!.*\/\/)(?!.*[\u0000-\u001f\u007f])[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const EXCLUDED_TABLE_DATA = Object.freeze(["DocumentChunk"] as const);
const SENSITIVE_KEY = /(?:password|secret|token|cookie|email|name|path|query|url|body|content|provider|private|credential|database|host|slug|title|document|attachment)/i;
const ALLOWED_SENSITIVE_KEYS = new Set([
  "format",
  "backupId",
  "epochUtc",
  "database",
  "databaseNameHash",
  "sha256",
  "sizeBytes",
  "excludedTableData",
  "attachments",
  "archiveSha256",
  "archiveSizeBytes",
  "entries",
  "id",
  "documentId",
  "status",
  "relativePath",
  "contentSha256",
  "aggregateCounts",
  "organizations",
  "workspaces",
  "documents",
  "migrations",
  "appliedIds",
  "orderedIdsSha256",
  "schemaFingerprintSha256",
  "snapshotRuntime",
  "imageDigest",
  "sourceCommit",
  "capabilityFloorSha256",
  "releaseEvidenceSha256",
  "recoveryPointerAtCapture",
  "recordSha256",
  "artifactSetSha256",
  "acceptedSnapshotContractSha256",
  "registeredWritersSha256",
  "captureSealPolicySha256",
  "journal",
  "genesisHash",
  "chainAtSnapshot",
  "sequence",
  "entryHash",
  "exportCheckpointAtSnapshot",
  "latestExportBatchDigest",
  "containingBatchFirstSequence",
  "containingBatchDigest",
  "encryptedPayloadSha256",
  "encryptedPayloadSizeBytes",
  "ciphertextObject",
  "keySha256",
  "providerGeneration",
  "manifestSha256",
  "snapshotImageDigest",
  "journalSequence",
  "captureSealSha256",
  "decryptVerificationSha256",
  "createdAt",
  "nonce",
]);

type AttachmentStatus = "PENDING" | "READY" | "DELETE_PENDING" | "DELETED" | "FAILED";

export type SnapshotManifestV2 = Readonly<{
  format: typeof SNAPSHOT_MANIFEST_FORMAT;
  backupId: string;
  epochUtc: string;
  databaseNameHash: string;
  database: Readonly<{
    format: "postgres-custom";
    sha256: string;
    sizeBytes: string;
    excludedTableData: readonly ["DocumentChunk"];
  }>;
  attachments: Readonly<{
    archiveSha256: string;
    archiveSizeBytes: string;
    entries: readonly Readonly<{
      id: string;
      documentId: string | null;
      status: AttachmentStatus;
      relativePath: string | null;
      sizeBytes: string;
      contentSha256: string | null;
    }>[];
  }>;
  aggregateCounts: Readonly<{
    organizations: string;
    workspaces: string;
    documents: string;
    attachments: string;
  }>;
  migrations: Readonly<{
    appliedIds: readonly string[];
    orderedIdsSha256: string;
    schemaFingerprintSha256: string;
  }>;
  snapshotRuntime: Readonly<{
    imageDigest: `sha256:${string}`;
    sourceCommit: string;
    capabilityFloorSha256: string;
    releaseEvidenceSha256: string;
  }>;
  recoveryPointerAtCapture: Readonly<{
    recordSha256: string;
    imageDigest: `sha256:${string}`;
    capabilityFloorSha256: string;
    releaseEvidenceSha256: string;
    artifactSetSha256: string;
    acceptedSnapshotContractSha256: string;
  }>;
  registeredWritersSha256: string;
  captureSealPolicySha256: string;
  journal: Readonly<{
    genesisHash: string;
    chainAtSnapshot: Readonly<{ sequence: string; entryHash: string }>;
    exportCheckpointAtSnapshot: Readonly<{
      sequence: string;
      entryHash: string;
      latestExportBatchDigest: string | null;
      containingBatchFirstSequence: string | null;
      containingBatchDigest: string | null;
    }>;
  }>;
}>;

export type SnapshotEnvelopeV2 = Readonly<{
  format: typeof SNAPSHOT_ENVELOPE_FORMAT;
  backupId: string;
  epochUtc: string;
  encryptedPayloadSha256: string;
  encryptedPayloadSizeBytes: string;
  ciphertextObject: Readonly<{
    keySha256: string;
    providerGeneration: string;
    sha256: string;
    sizeBytes: string;
  }>;
  manifestSha256: string;
  snapshotImageDigest: `sha256:${string}`;
  capabilityFloorSha256: string;
  journalSequence: string;
  captureSealSha256: string;
  decryptVerificationSha256: string;
  createdAt: string;
  nonce: string;
}>;

export type SnapshotEnvelopeReceipts = Readonly<{
  rootCiphertextSeal: Readonly<{
    backupId: string;
    encryptedPayloadSha256: string;
    sizeBytes: string;
    captureSealSha256: string;
    sealed: true;
  }>;
  exactRead: Readonly<{
    keySha256: string;
    providerGeneration: string;
    sha256: string;
    sizeBytes: string;
  }>;
  decryptVerification: Readonly<{
    verified: true;
    sha256: string;
    encryptedPayloadSha256: string;
    manifestSha256: string;
  }>;
}>;

export type AttachmentArchiveEntry = Readonly<{
  id: string;
  relativePath: string;
  sizeBytes: string;
  contentSha256: string;
}>;

export type ManifestPayloadIntegrity = Readonly<{
  database: Readonly<{ sha256: string; sizeBytes: string }>;
  archive: Readonly<{
    sha256: string;
    sizeBytes: string;
    entries: readonly AttachmentArchiveEntry[];
  }>;
}>;

export type RecoveryCompatibilityEvidence = Readonly<{
  /** A verifier for the independently attested recovery floor. */
  acceptsCapabilityFloor: (capabilityFloorSha256: string) => boolean;
}>;

export class SnapshotManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotManifestError";
  }
}

function fail(message: string): never {
  throw new SnapshotManifestError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${path} must be an object`);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) {
      if (SENSITIVE_KEY.test(key)) fail(`${path}.${key} is a sensitive or forbidden field`);
      fail(`${path}.${key} is an unknown field`);
    }
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`${path}.${key} is required`);
  }
}

function assertString(value: unknown, path: string, maxLength = 1024): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    fail(`${path} must be a non-empty bounded string`);
  }
}

function assertHash(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${path} must be a lowercase SHA-256 hash`);
}

function assertImageDigest(value: unknown, path: string): asserts value is `sha256:${string}` {
  if (typeof value !== "string" || !IMAGE_DIGEST.test(value)) fail(`${path} must be a sha256 image digest`);
}

function assertId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !ID.test(value)) fail(`${path} must be a canonical bounded id`);
}

function assertCommit(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !COMMIT.test(value)) fail(`${path} must be a canonical commit id`);
}

function assertDecimal(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length > MAX_DECIMAL_DIGITS || !DECIMAL.test(value)) {
    fail(`${path} must be a bounded canonical unsigned decimal string`);
  }
}

function decimal(value: string, path: string): bigint {
  assertDecimal(value, path);
  return BigInt(value);
}

function assertUtc(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !UTC.test(value)) {
    fail(`${path} must be a canonical UTC timestamp`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${path} must be a canonical UTC timestamp`);
  try {
    if (new Date(parsed).toISOString() !== value) fail(`${path} must be a canonical UTC timestamp`);
  } catch {
    fail(`${path} must be a canonical UTC timestamp`);
  }
}

function assertNonce(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !NONCE.test(value)) fail(`${path} must be a 32-byte lowercase nonce`);
}

function assertGeneration(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !GENERATION.test(value) || value.toLowerCase() === "latest") {
    fail(`${path} must be an immutable provider generation`);
  }
}

function assertRelativePath(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length > 512 || !SAFE_RELATIVE_PATH.test(value)) fail(`${path} must be a safe relative path`);
}

function assertDenseArray(value: unknown, path: string, maxLength = 100_000): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) fail(`${path} must be a bounded array`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) fail(`${path} must be a dense array`);
  }
}

function assertCanonicalAscending(values: readonly string[], path: string): readonly string[] {
  let previous: string | undefined;
  for (const [index, value] of values.entries()) {
    assertId(value, `${path}[${index}]`);
    if (previous !== undefined && value <= previous) {
      fail(`${path} must be strictly sorted by canonical id without duplicates`);
    }
    previous = value;
  }
  return Object.freeze([...values]);
}

function assertLiteral<T extends string | number | boolean>(value: unknown, expected: T, path: string): asserts value is T {
  if (value !== expected) fail(`${path} must equal ${JSON.stringify(expected)}`);
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

/**
 * Reject sensitive-looking keys in untrusted nested data.  Four hashed/safe
 * fields are explicitly part of the public/private contract; their values are
 * still validated by the schema parser.
 */
export function assertNoSensitiveKeys(value: unknown, path = "value", depth = 0): void {
  if (depth > MAX_NESTED_DEPTH) fail(`${path} exceeds maximum nesting depth`);
  if (Array.isArray(value)) {
    assertDenseArray(value, path);
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key) && !ALLOWED_SENSITIVE_KEYS.has(key)) {
      fail(`${path}.${key} is a sensitive or forbidden field`);
    }
    assertNoSensitiveKeys(child, `${path}.${key}`, depth + 1);
  }
}

function parseAttachmentEntry(value: unknown, index: number): SnapshotManifestV2["attachments"]["entries"][number] {
  const path = `manifest.attachments.entries[${index}]`;
  assertRecord(value, path);
  assertExactKeys(value, ["id", "documentId", "status", "relativePath", "sizeBytes", "contentSha256"], path);
  assertId(value.id, `${path}.id`);
  if (value.documentId !== null) assertId(value.documentId, `${path}.documentId`);
  if (!["PENDING", "READY", "DELETE_PENDING", "DELETED", "FAILED"].includes(value.status as string)) {
    fail(`${path}.status is not a known attachment state`);
  }
  assertDecimal(value.sizeBytes, `${path}.sizeBytes`);
  const size = decimal(value.sizeBytes, `${path}.sizeBytes`);
  if (value.relativePath !== null) assertRelativePath(value.relativePath, `${path}.relativePath`);
  if (value.contentSha256 !== null) assertHash(value.contentSha256, `${path}.contentSha256`);

  if (value.status === "READY") {
    if (value.documentId === null) fail(`${path}.documentId is required for READY`);
    if (value.relativePath === null) fail(`${path}.relativePath is required for READY`);
    if (value.contentSha256 === null) fail(`${path}.contentSha256 is required for READY`);
    if (size === BigInt(0)) fail(`${path}.sizeBytes must be non-zero for READY`);
  } else if (value.relativePath !== null || value.contentSha256 !== null) {
    fail(`${path} non-READY entries cannot carry readable file metadata`);
  }

  return freeze({
    id: value.id,
    documentId: value.documentId,
    status: value.status as AttachmentStatus,
    relativePath: value.relativePath,
    sizeBytes: value.sizeBytes,
    contentSha256: value.contentSha256,
  });
}

function parseJournal(value: unknown): SnapshotManifestV2["journal"] {
  const path = "manifest.journal";
  assertRecord(value, path);
  assertExactKeys(value, ["genesisHash", "chainAtSnapshot", "exportCheckpointAtSnapshot"], path);
  assertHash(value.genesisHash, `${path}.genesisHash`);

  assertRecord(value.chainAtSnapshot, `${path}.chainAtSnapshot`);
  assertExactKeys(value.chainAtSnapshot, ["sequence", "entryHash"], `${path}.chainAtSnapshot`);
  assertDecimal(value.chainAtSnapshot.sequence, `${path}.chainAtSnapshot.sequence`);
  assertHash(value.chainAtSnapshot.entryHash, `${path}.chainAtSnapshot.entryHash`);
  const chainSequence = decimal(value.chainAtSnapshot.sequence, `${path}.chainAtSnapshot.sequence`);
  if (chainSequence > MAX_JOURNAL_SEQUENCE) fail(`${path}.chainAtSnapshot.sequence exceeds Leaf 2 int64 range`);

  assertRecord(value.exportCheckpointAtSnapshot, `${path}.exportCheckpointAtSnapshot`);
  const checkpointPath = `${path}.exportCheckpointAtSnapshot`;
  assertExactKeys(value.exportCheckpointAtSnapshot, ["sequence", "entryHash", "latestExportBatchDigest", "containingBatchFirstSequence", "containingBatchDigest"], checkpointPath);
  assertDecimal(value.exportCheckpointAtSnapshot.sequence, `${checkpointPath}.sequence`);
  assertHash(value.exportCheckpointAtSnapshot.entryHash, `${checkpointPath}.entryHash`);
  const checkpointSequence = decimal(value.exportCheckpointAtSnapshot.sequence, `${checkpointPath}.sequence`);
  if (checkpointSequence > MAX_JOURNAL_SEQUENCE) fail(`${checkpointPath}.sequence exceeds Leaf 2 int64 range`);
  if (value.exportCheckpointAtSnapshot.latestExportBatchDigest !== null) assertHash(value.exportCheckpointAtSnapshot.latestExportBatchDigest, `${checkpointPath}.latestExportBatchDigest`);
  if (value.exportCheckpointAtSnapshot.containingBatchFirstSequence !== null) assertDecimal(value.exportCheckpointAtSnapshot.containingBatchFirstSequence, `${checkpointPath}.containingBatchFirstSequence`);
  if (value.exportCheckpointAtSnapshot.containingBatchDigest !== null) assertHash(value.exportCheckpointAtSnapshot.containingBatchDigest, `${checkpointPath}.containingBatchDigest`);

  const containingFirst = value.exportCheckpointAtSnapshot.containingBatchFirstSequence;
  const containingDigest = value.exportCheckpointAtSnapshot.containingBatchDigest;
  if ((containingFirst === null) !== (containingDigest === null)) fail(`${checkpointPath} containing batch fields must be both null or both present`);
  if (containingFirst === null && value.exportCheckpointAtSnapshot.sequence !== "0") {
    fail(`${checkpointPath} containing batch fields may be null only at genesis`);
  }
  if (containingFirst !== null && decimal(containingFirst, `${checkpointPath}.containingBatchFirstSequence`) === BigInt(0)) {
    fail(`${checkpointPath}.containingBatchFirstSequence must start at sequence one`);
  }
  if (checkpointSequence > chainSequence) {
    fail(`${checkpointPath}.sequence cannot exceed chainAtSnapshot.sequence`);
  }
  if (chainSequence === BigInt(0) && value.chainAtSnapshot.entryHash !== value.genesisHash) {
    fail(`${path}.chainAtSnapshot.entryHash must match genesisHash at sequence zero`);
  }
  if (checkpointSequence === BigInt(0) && value.exportCheckpointAtSnapshot.entryHash !== value.genesisHash) {
    fail(`${checkpointPath}.entryHash must match genesisHash at sequence zero`);
  }
  if (chainSequence > BigInt(0) && value.chainAtSnapshot.entryHash === value.genesisHash) {
    fail(`${path}.chainAtSnapshot.entryHash cannot equal genesisHash at a positive sequence`);
  }
  if (checkpointSequence > BigInt(0) && value.exportCheckpointAtSnapshot.entryHash === value.genesisHash) {
    fail(`${checkpointPath}.entryHash cannot equal genesisHash at a positive sequence`);
  }
  if (chainSequence === checkpointSequence && value.chainAtSnapshot.entryHash !== value.exportCheckpointAtSnapshot.entryHash) {
    fail(`${checkpointPath}.entryHash must match chainAtSnapshot.entryHash at the same sequence`);
  }
  if (chainSequence !== checkpointSequence && value.chainAtSnapshot.entryHash === value.exportCheckpointAtSnapshot.entryHash) {
    fail(`${checkpointPath}.entryHash must differ from chainAtSnapshot.entryHash at a different sequence`);
  }
  if (checkpointSequence === BigInt(0) && value.exportCheckpointAtSnapshot.latestExportBatchDigest !== null) {
    fail(`${checkpointPath}.latestExportBatchDigest must be null at sequence zero`);
  }
  if (checkpointSequence > BigInt(0) && value.exportCheckpointAtSnapshot.latestExportBatchDigest === null) {
    fail(`${checkpointPath}.latestExportBatchDigest is required after genesis`);
  }
  if (
    checkpointSequence > BigInt(0) &&
    value.exportCheckpointAtSnapshot.latestExportBatchDigest !== value.exportCheckpointAtSnapshot.containingBatchDigest
  ) {
    fail(`${checkpointPath} latest and containing batch digests must match after genesis`);
  }
  if (
    containingFirst !== null &&
    decimal(containingFirst, `${checkpointPath}.containingBatchFirstSequence`) > checkpointSequence
  ) {
    fail(`${checkpointPath}.containingBatchFirstSequence cannot exceed checkpoint sequence`);
  }

  return freeze({
    genesisHash: value.genesisHash,
    chainAtSnapshot: freeze({ sequence: value.chainAtSnapshot.sequence, entryHash: value.chainAtSnapshot.entryHash }),
    exportCheckpointAtSnapshot: freeze({
      sequence: value.exportCheckpointAtSnapshot.sequence,
      entryHash: value.exportCheckpointAtSnapshot.entryHash,
      latestExportBatchDigest: value.exportCheckpointAtSnapshot.latestExportBatchDigest,
      containingBatchFirstSequence: value.exportCheckpointAtSnapshot.containingBatchFirstSequence,
      containingBatchDigest: value.exportCheckpointAtSnapshot.containingBatchDigest,
    }),
  });
}

/** Parse and freeze the exhaustive private v2 manifest. */
export function parseSnapshotManifest(value: unknown): SnapshotManifestV2 {
  assertNoSensitiveKeys(value);
  assertRecord(value, "manifest");
  assertExactKeys(value, ["format", "backupId", "epochUtc", "databaseNameHash", "database", "attachments", "aggregateCounts", "migrations", "snapshotRuntime", "recoveryPointerAtCapture", "registeredWritersSha256", "captureSealPolicySha256", "journal"], "manifest");
  assertLiteral(value.format, SNAPSHOT_MANIFEST_FORMAT, "manifest.format");
  assertId(value.backupId, "manifest.backupId");
  assertUtc(value.epochUtc, "manifest.epochUtc");
  assertHash(value.databaseNameHash, "manifest.databaseNameHash");

  assertRecord(value.database, "manifest.database");
  assertExactKeys(value.database, ["format", "sha256", "sizeBytes", "excludedTableData"], "manifest.database");
  assertLiteral(value.database.format, "postgres-custom", "manifest.database.format");
  assertHash(value.database.sha256, "manifest.database.sha256");
  assertDecimal(value.database.sizeBytes, "manifest.database.sizeBytes");
  if (decimal(value.database.sizeBytes, "manifest.database.sizeBytes") === BigInt(0)) {
    fail("manifest.database.sizeBytes must be non-zero");
  }
  if (!Array.isArray(value.database.excludedTableData) || value.database.excludedTableData.length !== 1 || value.database.excludedTableData[0] !== "DocumentChunk") {
    fail("manifest.database.excludedTableData must equal [DocumentChunk]");
  }

  assertRecord(value.attachments, "manifest.attachments");
  assertExactKeys(value.attachments, ["archiveSha256", "archiveSizeBytes", "entries"], "manifest.attachments");
  assertHash(value.attachments.archiveSha256, "manifest.attachments.archiveSha256");
  assertDecimal(value.attachments.archiveSizeBytes, "manifest.attachments.archiveSizeBytes");
  const archiveSize = decimal(value.attachments.archiveSizeBytes, "manifest.attachments.archiveSizeBytes");
  assertDenseArray(value.attachments.entries, "manifest.attachments.entries");
  const entries = value.attachments.entries.map(parseAttachmentEntry);
  const relativePaths = new Set<string>();
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].id >= entries[index].id) fail("manifest.attachments.entries must be sorted by id without duplicates");
  }
  for (const entry of entries) {
    if (entry.relativePath === null) continue;
    if (relativePaths.has(entry.relativePath)) fail("manifest.attachments.entries must not duplicate relative paths");
    relativePaths.add(entry.relativePath);
  }
  if (entries.some((entry) => entry.status === "READY") && archiveSize === BigInt(0)) {
    fail("manifest.attachments.archiveSizeBytes must be non-zero when READY entries exist");
  }
  const readyDocumentIds = new Set(entries.filter((entry) => entry.status === "READY").map((entry) => entry.documentId as string));

  assertRecord(value.aggregateCounts, "manifest.aggregateCounts");
  assertExactKeys(value.aggregateCounts, ["organizations", "workspaces", "documents", "attachments"], "manifest.aggregateCounts");
  for (const key of ["organizations", "workspaces", "documents", "attachments"] as const) assertDecimal(value.aggregateCounts[key], `manifest.aggregateCounts.${key}`);
  if (decimal(value.aggregateCounts.documents as string, "manifest.aggregateCounts.documents") < BigInt(readyDocumentIds.size)) {
    fail("manifest.aggregateCounts.documents must cover READY attachment document references");
  }
  if (decimal(value.aggregateCounts.attachments as string, "manifest.aggregateCounts.attachments") !== BigInt(entries.length)) {
    fail("manifest.aggregateCounts.attachments must match attachment inventory");
  }

  assertRecord(value.migrations, "manifest.migrations");
  assertExactKeys(value.migrations, ["appliedIds", "orderedIdsSha256", "schemaFingerprintSha256"], "manifest.migrations");
  assertDenseArray(value.migrations.appliedIds, "manifest.migrations.appliedIds");
  if (value.migrations.appliedIds.some((item) => typeof item !== "string")) fail("manifest.migrations.appliedIds must contain strings");
  const appliedIds = assertCanonicalAscending(value.migrations.appliedIds as string[], "manifest.migrations.appliedIds");
  assertHash(value.migrations.orderedIdsSha256, "manifest.migrations.orderedIdsSha256");
  if (!equalHash(migrationIdsSha256(appliedIds), value.migrations.orderedIdsSha256)) {
    fail("manifest.migrations.orderedIdsSha256 must match appliedIds");
  }
  assertHash(value.migrations.schemaFingerprintSha256, "manifest.migrations.schemaFingerprintSha256");

  const parseRuntime = (raw: unknown, path: string) => {
    assertRecord(raw, path);
    assertExactKeys(raw, ["imageDigest", "sourceCommit", "capabilityFloorSha256", "releaseEvidenceSha256"], path);
    assertImageDigest(raw.imageDigest, `${path}.imageDigest`);
    assertCommit(raw.sourceCommit, `${path}.sourceCommit`);
    assertHash(raw.capabilityFloorSha256, `${path}.capabilityFloorSha256`);
    assertHash(raw.releaseEvidenceSha256, `${path}.releaseEvidenceSha256`);
    return freeze({ imageDigest: raw.imageDigest, sourceCommit: raw.sourceCommit, capabilityFloorSha256: raw.capabilityFloorSha256, releaseEvidenceSha256: raw.releaseEvidenceSha256 });
  };
  const snapshotRuntime = parseRuntime(value.snapshotRuntime, "manifest.snapshotRuntime");

  assertRecord(value.recoveryPointerAtCapture, "manifest.recoveryPointerAtCapture");
  assertExactKeys(value.recoveryPointerAtCapture, ["recordSha256", "imageDigest", "capabilityFloorSha256", "releaseEvidenceSha256", "artifactSetSha256", "acceptedSnapshotContractSha256"], "manifest.recoveryPointerAtCapture");
  for (const key of ["recordSha256", "capabilityFloorSha256", "releaseEvidenceSha256", "artifactSetSha256", "acceptedSnapshotContractSha256"] as const) assertHash(value.recoveryPointerAtCapture[key], `manifest.recoveryPointerAtCapture.${key}`);
  assertImageDigest(value.recoveryPointerAtCapture.imageDigest, "manifest.recoveryPointerAtCapture.imageDigest");

  assertHash(value.registeredWritersSha256, "manifest.registeredWritersSha256");
  assertHash(value.captureSealPolicySha256, "manifest.captureSealPolicySha256");
  const journal = parseJournal(value.journal);

  return freeze({
    format: SNAPSHOT_MANIFEST_FORMAT,
    backupId: value.backupId,
    epochUtc: value.epochUtc,
    databaseNameHash: value.databaseNameHash,
    database: freeze({ format: "postgres-custom", sha256: value.database.sha256, sizeBytes: value.database.sizeBytes, excludedTableData: EXCLUDED_TABLE_DATA }),
    attachments: freeze({ archiveSha256: value.attachments.archiveSha256, archiveSizeBytes: value.attachments.archiveSizeBytes, entries: Object.freeze(entries) }),
    aggregateCounts: freeze({ organizations: value.aggregateCounts.organizations as string, workspaces: value.aggregateCounts.workspaces as string, documents: value.aggregateCounts.documents as string, attachments: value.aggregateCounts.attachments as string }),
    migrations: freeze({ appliedIds, orderedIdsSha256: value.migrations.orderedIdsSha256, schemaFingerprintSha256: value.migrations.schemaFingerprintSha256 }),
    snapshotRuntime,
    recoveryPointerAtCapture: freeze({
      recordSha256: value.recoveryPointerAtCapture.recordSha256,
      imageDigest: value.recoveryPointerAtCapture.imageDigest,
      capabilityFloorSha256: value.recoveryPointerAtCapture.capabilityFloorSha256,
      releaseEvidenceSha256: value.recoveryPointerAtCapture.releaseEvidenceSha256,
      artifactSetSha256: value.recoveryPointerAtCapture.artifactSetSha256,
      acceptedSnapshotContractSha256: value.recoveryPointerAtCapture.acceptedSnapshotContractSha256,
    }),
    registeredWritersSha256: value.registeredWritersSha256,
    captureSealPolicySha256: value.captureSealPolicySha256,
    journal,
  } as SnapshotManifestV2);
}

/** SHA-256 over bytes; no content is logged or persisted by this helper. */
export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** SHA-256 over the canonical migration id list. */
export function migrationIdsSha256(appliedIds: readonly string[]): string {
  const canonical = [...assertCanonicalAscending(appliedIds, "appliedIds")].join("\n");
  return sha256Bytes(Buffer.from(canonical, "utf8"));
}

/** Deterministic compatibility digest for the current migration/schema tuple. */
export function snapshotCompatibilityContractSha256(manifest: Pick<SnapshotManifestV2, "migrations">): string {
  const canonical = `${manifest.migrations.orderedIdsSha256}\n${manifest.migrations.schemaFingerprintSha256}`;
  return sha256Bytes(Buffer.from(canonical, "utf8"));
}

/** SHA-256 over the parser's canonical, field-ordered manifest JSON. */
export function snapshotManifestSha256(manifest: SnapshotManifestV2): string {
  return sha256Bytes(Buffer.from(JSON.stringify(manifest), "utf8"));
}

function equalHash(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(actual, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verify byte/archive receipts against the parsed manifest.  Archive entries
 * represent only extracted READY files; non-READY rows remain inventory-only.
 */
export function assertManifestPayloadIntegrity(manifest: SnapshotManifestV2, actual: ManifestPayloadIntegrity): void {
  assertNoSensitiveKeys(actual, "actual");
  if (!isRecord(actual) || !isRecord(actual.database) || !isRecord(actual.archive)) fail("actual payload receipts must be objects");
  assertExactKeys(actual, ["database", "archive"], "actual");
  assertExactKeys(actual.database, ["sha256", "sizeBytes"], "actual.database");
  assertExactKeys(actual.archive, ["sha256", "sizeBytes", "entries"], "actual.archive");
  assertHash(actual.database.sha256, "actual.database.sha256");
  assertDecimal(actual.database.sizeBytes, "actual.database.sizeBytes");
  assertHash(actual.archive.sha256, "actual.archive.sha256");
  assertDecimal(actual.archive.sizeBytes, "actual.archive.sizeBytes");
  assertDenseArray(actual.archive.entries, "actual.archive.entries");
  for (const [index, value] of actual.archive.entries.entries()) {
    const path = `actual.archive.entries[${index}]`;
    assertRecord(value, path);
    assertExactKeys(value, ["id", "relativePath", "sizeBytes", "contentSha256"], path);
    assertId(value.id, `${path}.id`);
    assertRelativePath(value.relativePath, `${path}.relativePath`);
    assertDecimal(value.sizeBytes, `${path}.sizeBytes`);
    assertHash(value.contentSha256, `${path}.contentSha256`);
  }
  if (!equalHash(manifest.database.sha256, actual.database.sha256) || manifest.database.sizeBytes !== actual.database.sizeBytes) fail("database payload does not match manifest");
  if (!equalHash(manifest.attachments.archiveSha256, actual.archive.sha256) || manifest.attachments.archiveSizeBytes !== actual.archive.sizeBytes) fail("attachment archive does not match manifest");

  const expected = manifest.attachments.entries.filter((entry) => entry.status === "READY");
  if (expected.length !== actual.archive.entries.length) fail("attachment archive entries do not match manifest");
  const actualEntries = [...actual.archive.entries].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const actualIds = new Set<string>();
  const actualPaths = new Set<string>();
  for (let index = 0; index < expected.length; index += 1) {
    const left = expected[index];
    const right = actualEntries[index];
    if (right) {
      assertId(right.id, `archive.entries[${index}].id`);
      assertRelativePath(right.relativePath, `archive.entries[${index}].relativePath`);
      assertDecimal(right.sizeBytes, `archive.entries[${index}].sizeBytes`);
      if (!actualIds.add(right.id) || !actualPaths.add(right.relativePath)) fail("attachment archive entries must not contain duplicate ids or paths");
    }
    if (!right || left.id !== right.id || left.relativePath !== right.relativePath || left.sizeBytes !== right.sizeBytes || left.contentSha256 !== right.contentSha256) {
      fail("attachment archive entry does not match manifest");
    }
    assertHash(right.contentSha256, `archive.entries[${index}].contentSha256`);
  }
}

/** Verify the independent recovery floor and compatibility contract. */
export function assertRecoveryCompatibility(manifest: SnapshotManifestV2, evidence: RecoveryCompatibilityEvidence): void {
  if (!evidence.acceptsCapabilityFloor(manifest.recoveryPointerAtCapture.capabilityFloorSha256)) {
    fail("recovery capability floor does not accept the current snapshot");
  }
  const expected = snapshotCompatibilityContractSha256(manifest);
  if (!equalHash(expected, manifest.recoveryPointerAtCapture.acceptedSnapshotContractSha256)) {
    fail("recovery compatibility contract does not cover the current migration/schema tuple");
  }
}

function parseEnvelopeBase(value: unknown): SnapshotEnvelopeV2 {
  assertNoSensitiveKeys(value);
  assertRecord(value, "envelope");
  assertExactKeys(value, ["format", "backupId", "epochUtc", "encryptedPayloadSha256", "encryptedPayloadSizeBytes", "ciphertextObject", "manifestSha256", "snapshotImageDigest", "capabilityFloorSha256", "journalSequence", "captureSealSha256", "decryptVerificationSha256", "createdAt", "nonce"], "envelope");
  assertLiteral(value.format, SNAPSHOT_ENVELOPE_FORMAT, "envelope.format");
  assertId(value.backupId, "envelope.backupId");
  assertUtc(value.epochUtc, "envelope.epochUtc");
  assertHash(value.encryptedPayloadSha256, "envelope.encryptedPayloadSha256");
  assertDecimal(value.encryptedPayloadSizeBytes, "envelope.encryptedPayloadSizeBytes");
  if (decimal(value.encryptedPayloadSizeBytes, "envelope.encryptedPayloadSizeBytes") === BigInt(0)) fail("envelope.encryptedPayloadSizeBytes must be non-zero");

  assertRecord(value.ciphertextObject, "envelope.ciphertextObject");
  assertExactKeys(value.ciphertextObject, ["keySha256", "providerGeneration", "sha256", "sizeBytes"], "envelope.ciphertextObject");
  assertHash(value.ciphertextObject.keySha256, "envelope.ciphertextObject.keySha256");
  assertGeneration(value.ciphertextObject.providerGeneration, "envelope.ciphertextObject.providerGeneration");
  assertHash(value.ciphertextObject.sha256, "envelope.ciphertextObject.sha256");
  assertDecimal(value.ciphertextObject.sizeBytes, "envelope.ciphertextObject.sizeBytes");
  if (!equalHash(value.encryptedPayloadSha256, value.ciphertextObject.sha256) || value.encryptedPayloadSizeBytes !== value.ciphertextObject.sizeBytes) fail("ciphertext object does not match encrypted payload");

  assertHash(value.manifestSha256, "envelope.manifestSha256");
  assertImageDigest(value.snapshotImageDigest, "envelope.snapshotImageDigest");
  assertHash(value.capabilityFloorSha256, "envelope.capabilityFloorSha256");
  assertDecimal(value.journalSequence, "envelope.journalSequence");
  assertHash(value.captureSealSha256, "envelope.captureSealSha256");
  assertHash(value.decryptVerificationSha256, "envelope.decryptVerificationSha256");
  assertUtc(value.createdAt, "envelope.createdAt");
  assertNonce(value.nonce, "envelope.nonce");
  if (new Date(value.createdAt).getTime() < new Date(value.epochUtc).getTime()) fail("envelope.createdAt cannot precede epochUtc");

  return freeze({
    format: SNAPSHOT_ENVELOPE_FORMAT,
    backupId: value.backupId,
    epochUtc: value.epochUtc,
    encryptedPayloadSha256: value.encryptedPayloadSha256,
    encryptedPayloadSizeBytes: value.encryptedPayloadSizeBytes,
    ciphertextObject: freeze({ keySha256: value.ciphertextObject.keySha256, providerGeneration: value.ciphertextObject.providerGeneration, sha256: value.ciphertextObject.sha256, sizeBytes: value.ciphertextObject.sizeBytes }),
    manifestSha256: value.manifestSha256,
    snapshotImageDigest: value.snapshotImageDigest,
    capabilityFloorSha256: value.capabilityFloorSha256,
    journalSequence: value.journalSequence,
    captureSealSha256: value.captureSealSha256,
    decryptVerificationSha256: value.decryptVerificationSha256,
    createdAt: value.createdAt,
    nonce: value.nonce,
  });
}

/**
 * Parse only after all three independent receipts exist.  Keeping receipts out
 * of the public envelope prevents accidental publication of paths or provider
 * metadata while still making signing fail closed before decrypt verification.
 */
export function parseSnapshotEnvelope(
  value: unknown,
  receipts: SnapshotEnvelopeReceipts,
  manifest: SnapshotManifestV2,
): SnapshotEnvelopeV2 {
  const envelope = parseEnvelopeBase(value);
  if (
    envelope.backupId !== manifest.backupId ||
    envelope.epochUtc !== manifest.epochUtc ||
    envelope.snapshotImageDigest !== manifest.snapshotRuntime.imageDigest ||
    envelope.capabilityFloorSha256 !== manifest.snapshotRuntime.capabilityFloorSha256 ||
    envelope.journalSequence !== manifest.journal.exportCheckpointAtSnapshot.sequence
  ) {
    fail("envelope metadata does not match decrypted manifest");
  }
  if (!equalHash(envelope.manifestSha256, snapshotManifestSha256(manifest))) {
    fail("envelope.manifestSha256 does not match decrypted manifest");
  }
  assertNoSensitiveKeys(receipts, "receipts");
  assertRecord(receipts, "receipts");
  assertExactKeys(receipts, ["rootCiphertextSeal", "exactRead", "decryptVerification"], "receipts");
  assertRecord(receipts.rootCiphertextSeal, "receipts.rootCiphertextSeal");
  assertRecord(receipts.exactRead, "receipts.exactRead");
  assertRecord(receipts.decryptVerification, "receipts.decryptVerification");
  assertExactKeys(receipts.rootCiphertextSeal, ["backupId", "encryptedPayloadSha256", "sizeBytes", "captureSealSha256", "sealed"], "receipts.rootCiphertextSeal");
  assertExactKeys(receipts.exactRead, ["keySha256", "providerGeneration", "sha256", "sizeBytes"], "receipts.exactRead");
  assertExactKeys(receipts.decryptVerification, ["verified", "sha256", "encryptedPayloadSha256", "manifestSha256"], "receipts.decryptVerification");
  assertId(receipts.rootCiphertextSeal.backupId, "receipts.rootCiphertextSeal.backupId");
  assertHash(receipts.rootCiphertextSeal.encryptedPayloadSha256, "receipts.rootCiphertextSeal.encryptedPayloadSha256");
  assertDecimal(receipts.rootCiphertextSeal.sizeBytes, "receipts.rootCiphertextSeal.sizeBytes");
  assertHash(receipts.rootCiphertextSeal.captureSealSha256, "receipts.rootCiphertextSeal.captureSealSha256");
  assertLiteral(receipts.rootCiphertextSeal.sealed, true, "receipts.rootCiphertextSeal.sealed");
  assertHash(receipts.exactRead.keySha256, "receipts.exactRead.keySha256");
  assertGeneration(receipts.exactRead.providerGeneration, "receipts.exactRead.providerGeneration");
  assertHash(receipts.exactRead.sha256, "receipts.exactRead.sha256");
  assertDecimal(receipts.exactRead.sizeBytes, "receipts.exactRead.sizeBytes");
  assertLiteral(receipts.decryptVerification.verified, true, "receipts.decryptVerification.verified");
  assertHash(receipts.decryptVerification.sha256, "receipts.decryptVerification.sha256");
  assertHash(receipts.decryptVerification.encryptedPayloadSha256, "receipts.decryptVerification.encryptedPayloadSha256");
  assertHash(receipts.decryptVerification.manifestSha256, "receipts.decryptVerification.manifestSha256");
  if (receipts.rootCiphertextSeal.backupId !== envelope.backupId || receipts.rootCiphertextSeal.encryptedPayloadSha256 !== envelope.encryptedPayloadSha256 || receipts.rootCiphertextSeal.sizeBytes !== envelope.encryptedPayloadSizeBytes || receipts.rootCiphertextSeal.captureSealSha256 !== envelope.captureSealSha256) fail("root ciphertext seal does not match envelope");
  if (receipts.exactRead.keySha256 !== envelope.ciphertextObject.keySha256 || receipts.exactRead.providerGeneration !== envelope.ciphertextObject.providerGeneration || receipts.exactRead.sha256 !== envelope.ciphertextObject.sha256 || receipts.exactRead.sizeBytes !== envelope.ciphertextObject.sizeBytes) fail("exact immutable ciphertext read does not match envelope");
  if (receipts.decryptVerification.verified !== true || receipts.decryptVerification.sha256 !== envelope.decryptVerificationSha256 || receipts.decryptVerification.encryptedPayloadSha256 !== envelope.encryptedPayloadSha256 || receipts.decryptVerification.manifestSha256 !== envelope.manifestSha256) fail("authenticated decrypt verification does not match envelope");
  return envelope;
}

/** The image in a snapshot is audit evidence and is never a restore selector. */
export function assertSnapshotImageEvidenceOnly(envelope: SnapshotEnvelopeV2): void {
  if ("restoreImageDigest" in envelope || "executableImage" in envelope) fail("snapshot image cannot be used as an executable restore selection");
}
