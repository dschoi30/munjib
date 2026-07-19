import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  SnapshotManifestError,
  assertManifestPayloadIntegrity,
  assertNoSensitiveKeys,
  assertRecoveryCompatibility,
  assertSnapshotImageEvidenceOnly,
  migrationIdsSha256,
  parseSnapshotEnvelope,
  snapshotManifestSha256,
  parseSnapshotManifest,
  sha256Bytes,
  snapshotCompatibilityContractSha256,
  type SnapshotEnvelopeReceipts,
  type SnapshotManifestV2,
} from "../../lib/backup/manifest";

const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const HASH_2 = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const IMAGE = `sha256:${HASH}` as const;
const IMAGE_2 = `sha256:${HASH_2}` as const;
const EPOCH = "2026-07-13T00:00:00.000Z";
const CREATED = "2026-07-13T00:00:01.000Z";

const completeManifest = (): SnapshotManifestV2 => {
  const appliedIds = ["20260712000000_add_journal", "20260712120000_add_retention"];
  const migrations = {
    appliedIds,
    orderedIdsSha256: migrationIdsSha256(appliedIds),
    schemaFingerprintSha256: HASH,
  } as const;
  const manifestWithoutContract = {
    format: "munjib-snapshot-manifest-v2" as const,
    backupId: "b20260713-0001",
    epochUtc: EPOCH,
    databaseNameHash: HASH,
    database: {
      format: "postgres-custom" as const,
      sha256: HASH,
      sizeBytes: "1024",
      excludedTableData: ["DocumentChunk"] as const,
    },
    attachments: {
      archiveSha256: HASH_2,
      archiveSizeBytes: "2048",
      entries: [
        {
          id: "att-0001",
          documentId: "doc-0001",
          status: "READY" as const,
          relativePath: "documents/att-0001.bin",
          sizeBytes: "42",
          contentSha256: HASH_2,
        },
        {
          id: "att-0002",
          documentId: "doc-0002",
          status: "PENDING" as const,
          relativePath: null,
          sizeBytes: "0",
          contentSha256: null,
        },
      ],
    },
    aggregateCounts: { organizations: "1", workspaces: "2", documents: "4", attachments: "2" },
    migrations,
    snapshotRuntime: {
      imageDigest: IMAGE,
      sourceCommit: "0123456789abcdef0123456789abcdef01234567",
      capabilityFloorSha256: HASH,
      releaseEvidenceSha256: HASH_2,
    },
    recoveryPointerAtCapture: {
      recordSha256: HASH_2,
      imageDigest: IMAGE_2,
      capabilityFloorSha256: HASH,
      releaseEvidenceSha256: HASH_2,
      artifactSetSha256: HASH,
      acceptedSnapshotContractSha256: HASH,
    },
    registeredWritersSha256: HASH,
    captureSealPolicySha256: HASH_2,
    journal: {
      genesisHash: HASH,
      chainAtSnapshot: { sequence: "8", entryHash: HASH_2 },
      exportCheckpointAtSnapshot: {
        sequence: "8",
        entryHash: HASH_2,
        latestExportBatchDigest: HASH,
        containingBatchFirstSequence: "1",
        containingBatchDigest: HASH,
      },
    },
  };
  const parsed = parseSnapshotManifest(manifestWithoutContract);
  return {
    ...parsed,
    recoveryPointerAtCapture: {
      ...parsed.recoveryPointerAtCapture,
      acceptedSnapshotContractSha256: snapshotCompatibilityContractSha256(parsed),
    },
  };
};

const completeEnvelope = () => {
  const manifest = completeManifest();
  const envelope = {
    format: "munjib-snapshot-envelope-v2" as const,
    backupId: manifest.backupId,
    epochUtc: EPOCH,
    encryptedPayloadSha256: HASH,
    encryptedPayloadSizeBytes: "4096",
    ciphertextObject: {
      keySha256: HASH_2,
      providerGeneration: "generation-20260713-0001",
      sha256: HASH,
      sizeBytes: "4096",
    },
    manifestSha256: snapshotManifestSha256(manifest),
    snapshotImageDigest: IMAGE,
    capabilityFloorSha256: HASH,
    journalSequence: "8",
    captureSealSha256: HASH_2,
    decryptVerificationSha256: HASH,
    createdAt: CREATED,
    nonce: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  };
  const receipts: SnapshotEnvelopeReceipts = {
    rootCiphertextSeal: {
      backupId: manifest.backupId,
      encryptedPayloadSha256: HASH,
      sizeBytes: "4096",
      captureSealSha256: HASH_2,
      sealed: true,
    },
    exactRead: {
      keySha256: HASH_2,
      providerGeneration: "generation-20260713-0001",
      sha256: HASH,
      sizeBytes: "4096",
    },
    decryptVerification: {
      verified: true,
      sha256: HASH,
      encryptedPayloadSha256: HASH,
      manifestSha256: snapshotManifestSha256(manifest),
    },
  };
  return { manifest, envelope, receipts };
};

describe("snapshot manifest v2", () => {
  test("accepts the exhaustive private manifest and freezes nested values", () => {
    const parsed = parseSnapshotManifest(completeManifest());
    expect(parsed.format).toBe("munjib-snapshot-manifest-v2");
    expect(parsed.snapshotRuntime.imageDigest).not.toBe(parsed.recoveryPointerAtCapture.imageDigest);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.database.excludedTableData)).toBe(true);
    expect(Object.isFrozen(parsed.attachments.entries)).toBe(true);
    expect(parsed.attachments.entries[0].status).toBe("READY");
  });

  test("rejects unknown and sensitive keys recursively", () => {
    const manifest = completeManifest();
    expect(() => parseSnapshotManifest({ ...manifest, password: "no" })).toThrow(/sensitive|unknown/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, nested: { apiToken: "no" } } })).toThrow(/sensitive|unknown/i);
    expect(() => assertNoSensitiveKeys({ relativePath: "safe/file", nested: { providerSecret: "no" } })).toThrow(/sensitive/i);
    let deeplyNested: unknown = {};
    for (let index = 0; index < 70; index += 1) deeplyNested = { nested: deeplyNested };
    expect(() => assertNoSensitiveKeys(deeplyNested)).toThrow(/depth/i);
  });

  test("requires own properties and rejects prototype-provided manifest fields", () => {
    const manifest = completeManifest();
    const inherited = Object.create(manifest) as Record<string, unknown>;
    expect(() => parseSnapshotManifest(inherited)).toThrow(/required/i);
    const withPrototypeSecret = { ...manifest } as Record<string, unknown>;
    Object.setPrototypeOf(withPrototypeSecret, { apiToken: "must-not-be-read" });
    expect(() => parseSnapshotManifest(withPrototypeSecret)).not.toThrow();
  });

  test("rejects sparse attachment and migration arrays", () => {
    const manifest = completeManifest();
    const sparseEntries = new Array(2) as unknown[];
    sparseEntries[1] = manifest.attachments.entries[1];
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, entries: sparseEntries } })).toThrow(/dense/i);
    const sparseMigrations = new Array(2) as unknown[];
    sparseMigrations[1] = manifest.migrations.appliedIds[1];
    expect(() => parseSnapshotManifest({ ...manifest, migrations: { ...manifest.migrations, appliedIds: sparseMigrations } })).toThrow(/dense/i);
  });

  test("rejects noncanonical decimals, hashes, timestamps, IDs, paths, and ordering", () => {
    const manifest = completeManifest();
    expect(() => parseSnapshotManifest({ ...manifest, epochUtc: "2026-07-13T00:00:00Z" })).toThrow(/timestamp/i);
    expect(() => parseSnapshotManifest({ ...manifest, epochUtc: "2026-02-30T00:00:00.000Z" })).toThrow(SnapshotManifestError);
    expect(() => parseSnapshotManifest({ ...manifest, epochUtc: "2026-13-45T25:61:61.999Z" })).toThrow(SnapshotManifestError);
    expect(() => parseSnapshotManifest({ ...manifest, database: { ...manifest.database, sizeBytes: 1 } })).toThrow(/decimal/i);
    expect(() => parseSnapshotManifest({ ...manifest, databaseNameHash: HASH.toUpperCase() })).toThrow(/hash/i);
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, entries: [{ ...manifest.attachments.entries[0], relativePath: "/absolute" }, manifest.attachments.entries[1]] } })).toThrow(/relative path/i);
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, entries: [{ ...manifest.attachments.entries[0], relativePath: "documents/" }, manifest.attachments.entries[1]] } })).toThrow(/relative path/i);
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, entries: [{ ...manifest.attachments.entries[0], relativePath: `${"a".repeat(513)}.bin` }, manifest.attachments.entries[1]] } })).toThrow(/relative path/i);
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, entries: [manifest.attachments.entries[1], manifest.attachments.entries[0]] } })).toThrow(/sorted/i);
    expect(() => parseSnapshotManifest({ ...manifest, migrations: { ...manifest.migrations, appliedIds: [...manifest.migrations.appliedIds].reverse() } })).toThrow(/sorted/i);
  });

  test("enforces attachment state and duplicate rules", () => {
    const manifest = completeManifest();
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, entries: [{ ...manifest.attachments.entries[0], status: "READY", sizeBytes: "0" }, manifest.attachments.entries[1]] } })).toThrow(/non-zero/i);
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, entries: [{ ...manifest.attachments.entries[0], status: "PENDING", relativePath: "leak.bin" }, manifest.attachments.entries[1]] } })).toThrow(/non-READY/i);
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, entries: [manifest.attachments.entries[0], { ...manifest.attachments.entries[1], id: manifest.attachments.entries[0].id }] } })).toThrow(/sorted|duplicate/i);

    const nonAdjacentDuplicateEntries = [
      { ...manifest.attachments.entries[0], id: "att-0001", relativePath: "documents/first.bin" },
      {
        ...manifest.attachments.entries[1],
        id: "att-0002",
        documentId: "doc-0002",
        status: "READY" as const,
        relativePath: "documents/second.bin",
        sizeBytes: "42",
        contentSha256: HASH_2,
      },
      {
        ...manifest.attachments.entries[1],
        id: "att-0003",
        documentId: "doc-0003",
        status: "READY" as const,
        relativePath: "documents/first.bin",
        sizeBytes: "42",
        contentSha256: HASH_2,
      },
    ];
    expect(() => parseSnapshotManifest({
      ...manifest,
      attachments: { ...manifest.attachments, entries: nonAdjacentDuplicateEntries },
    })).toThrow(/duplicate relative paths/i);
  });

  test("checks migration compatibility, journal high-water, and payload receipts", () => {
    const manifest = completeManifest();
    expect(() => assertRecoveryCompatibility(manifest, { acceptsCapabilityFloor: () => false, acceptsSnapshotContract: () => true })).toThrow(/floor/i);
    expect(() => assertRecoveryCompatibility(manifest, { acceptsCapabilityFloor: () => true, acceptsSnapshotContract: () => false })).toThrow(/independent|contract|pointer/i);
    expect(() => assertRecoveryCompatibility(manifest, { acceptsCapabilityFloor: () => true, acceptsSnapshotContract: () => true })).not.toThrow();
    expect(() => assertRecoveryCompatibility({
      ...manifest,
      recoveryPointerAtCapture: { ...manifest.recoveryPointerAtCapture, artifactSetSha256: HASH_2 },
    }, {
      acceptsCapabilityFloor: () => true,
      acceptsSnapshotContract: (_contract, pointer: any) => pointer === manifest.recoveryPointerAtCapture.recordSha256 || pointer.artifactSetSha256 === HASH,
    })).toThrow(/independent|pointer/i);
    expect(() => parseSnapshotManifest({
      ...manifest,
      migrations: { ...manifest.migrations, orderedIdsSha256: HASH },
    })).toThrow(/orderedIdsSha256|migration/i);

    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, exportCheckpointAtSnapshot: { ...manifest.journal.exportCheckpointAtSnapshot, sequence: "9" } } })).toThrow(/exceed/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, exportCheckpointAtSnapshot: { ...manifest.journal.exportCheckpointAtSnapshot, containingBatchFirstSequence: "9" } } })).toThrow(/containingBatchFirstSequence|checkpoint/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, exportCheckpointAtSnapshot: { ...manifest.journal.exportCheckpointAtSnapshot, containingBatchFirstSequence: "0" } } })).toThrow(/sequence one|containingBatchFirstSequence/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, exportCheckpointAtSnapshot: { ...manifest.journal.exportCheckpointAtSnapshot, entryHash: HASH } } })).toThrow(/same sequence|entryHash/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, exportCheckpointAtSnapshot: { ...manifest.journal.exportCheckpointAtSnapshot, sequence: "7" } } })).toThrow(/different sequence|entryHash/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, exportCheckpointAtSnapshot: { ...manifest.journal.exportCheckpointAtSnapshot, latestExportBatchDigest: null } } })).toThrow(/latestExportBatchDigest|genesis/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, exportCheckpointAtSnapshot: { ...manifest.journal.exportCheckpointAtSnapshot, containingBatchDigest: HASH_2 } } })).toThrow(/latest.*containing|batch digest/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, chainAtSnapshot: { sequence: "8", entryHash: HASH }, exportCheckpointAtSnapshot: { ...manifest.journal.exportCheckpointAtSnapshot, sequence: "8", entryHash: HASH } } })).toThrow(/genesisHash|positive sequence/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, chainAtSnapshot: { sequence: "9223372036854775808", entryHash: HASH_2 } } })).toThrow(/int64|sequence/i);
    expect(() => parseSnapshotManifest({ ...manifest, journal: { ...manifest.journal, chainAtSnapshot: { sequence: "0", entryHash: HASH_2 }, exportCheckpointAtSnapshot: { sequence: "0", entryHash: HASH_2, latestExportBatchDigest: null, containingBatchFirstSequence: null, containingBatchDigest: null } } })).toThrow(/genesis|sequence zero/i);
    expect(() => parseSnapshotManifest({ ...manifest, database: { ...manifest.database, sizeBytes: "0" } })).toThrow(/sizeBytes|non-zero/i);
    expect(() => parseSnapshotManifest({ ...manifest, database: { ...manifest.database, sizeBytes: "1".repeat(40) } })).toThrow(/decimal|bounded/i);
    expect(() => parseSnapshotManifest({ ...manifest, attachments: { ...manifest.attachments, archiveSizeBytes: "0" } })).toThrow(/archiveSizeBytes|READY/i);
    expect(() => parseSnapshotManifest({ ...manifest, aggregateCounts: { ...manifest.aggregateCounts, attachments: "3" } })).toThrow(/attachment inventory/i);
    expect(() => parseSnapshotManifest({ ...manifest, aggregateCounts: { ...manifest.aggregateCounts, documents: "0" } })).toThrow(/documents|READY/i);
    expect(() => parseSnapshotManifest({ ...manifest, aggregateCounts: { ...manifest.aggregateCounts, workspaces: "0" } })).toThrow(/workspaces|documents/i);
    expect(() => parseSnapshotManifest({ ...manifest, aggregateCounts: { ...manifest.aggregateCounts, organizations: "0" } })).toThrow(/organizations|workspaces/i);
    expect(() => parseSnapshotManifest({ ...manifest, aggregateCounts: { ...manifest.aggregateCounts, organizations: "9223372036854775808" } })).toThrow(/int64|count/i);
    expect(() => assertManifestPayloadIntegrity(manifest, {
      database: { sha256: HASH, sizeBytes: "1024" },
      archive: { sha256: HASH_2, sizeBytes: "2048", entries: [{ id: "att-0001", relativePath: "documents/att-0001.bin", sizeBytes: "42", contentSha256: HASH_2 }] },
    })).not.toThrow();
    expect(() => assertManifestPayloadIntegrity(manifest, {
      database: { sha256: HASH_2, sizeBytes: "1024" },
      archive: { sha256: HASH_2, sizeBytes: "2048", entries: [] },
    })).toThrow(/database/i);

    expect(() => assertManifestPayloadIntegrity(manifest, {
      database: { sha256: HASH, sizeBytes: "1024" },
      archive: { sha256: HASH_2, sizeBytes: "2048", entries: [
        { id: "att-0001", relativePath: "documents/att-0001.bin", sizeBytes: "42", contentSha256: HASH_2 },
        { id: "att-0001", relativePath: "documents/other.bin", sizeBytes: "42", contentSha256: HASH_2 },
      ] },
    })).toThrow(/entries|match/i);
  });

  test("uses constant-time hash helper inputs and canonical migration digest", () => {
    const bytes = Buffer.from("manifest-bytes", "utf8");
    expect(sha256Bytes(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(migrationIdsSha256(["a", "b"])).toBe(migrationIdsSha256(["a", "b"]));
    expect(() => migrationIdsSha256(["b", "a"])).toThrow(/sorted/i);
  });
});

describe("snapshot envelope v2", () => {
  test("requires root seal, immutable exact-read, and decrypt verification receipts", () => {
    const { manifest, envelope, receipts } = completeEnvelope();
    expect(() => parseSnapshotEnvelope(envelope, receipts, manifest)).not.toThrow();
    expect(() => parseSnapshotEnvelope(envelope, undefined as never, manifest)).toThrow(SnapshotManifestError);
    expect(() => parseSnapshotEnvelope(envelope, { ...receipts, rootCiphertextSeal: { ...receipts.rootCiphertextSeal, sealed: false as true } }, manifest)).toThrow(/seal/i);
    expect(() => parseSnapshotEnvelope(envelope, { ...receipts, exactRead: { ...receipts.exactRead, providerGeneration: "latest" } }, manifest)).toThrow(/generation/i);
    expect(() => parseSnapshotEnvelope(envelope, { ...receipts, decryptVerification: { ...receipts.decryptVerification, verified: false as true } }, manifest)).toThrow(/decrypt/i);
    const inheritedRoot = Object.create(receipts.rootCiphertextSeal) as Record<string, unknown>;
    expect(() => parseSnapshotEnvelope(envelope, { ...receipts, rootCiphertextSeal: inheritedRoot as never }, manifest)).toThrow(/required/i);
    expect(() => parseSnapshotEnvelope(envelope, { ...receipts, unexpected: true } as never, manifest)).toThrow(/unknown/i);
    expect(() => parseSnapshotEnvelope({ ...envelope, backupId: "b20260713-0002" }, receipts, manifest)).toThrow(/metadata|manifest/i);
  });

  test("rejects mutable generations, payload mismatches, and sensitive public fields", () => {
    const { manifest, envelope, receipts } = completeEnvelope();
    expect(() => parseSnapshotEnvelope({ ...envelope, ciphertextObject: { ...envelope.ciphertextObject, providerGeneration: "latest" } }, receipts, manifest)).toThrow(/generation/i);
    expect(() => parseSnapshotEnvelope({ ...envelope, ciphertextObject: { ...envelope.ciphertextObject, sizeBytes: "4097" } }, receipts, manifest)).toThrow(/payload/i);
    const divergentManifest = parseSnapshotManifest({ ...manifest, databaseNameHash: HASH_2 });
    expect(() => parseSnapshotEnvelope(envelope, receipts, divergentManifest)).toThrow(/manifestSha256|decrypted manifest/i);
    expect(() => parseSnapshotEnvelope({ ...envelope, apiToken: "no" }, receipts, manifest)).toThrow(/sensitive|unknown/i);
    expect(() => assertManifestPayloadIntegrity(completeManifest(), {
      database: { sha256: HASH, sizeBytes: "1024" },
      archive: { sha256: HASH_2, sizeBytes: "2048", entries: [null as never] },
    })).toThrow(SnapshotManifestError);
    expect(() => assertManifestPayloadIntegrity(completeManifest(), {
      database: { sha256: HASH, sizeBytes: "1024", inherited: true } as never,
      archive: { sha256: HASH_2, sizeBytes: "2048", entries: [] },
    })).toThrow(/unknown/i);
    const sparseArchiveEntries = new Array(1) as unknown[];
    expect(() => assertManifestPayloadIntegrity(completeManifest(), {
      database: { sha256: HASH, sizeBytes: "1024" },
      archive: { sha256: HASH_2, sizeBytes: "2048", entries: sparseArchiveEntries as never },
    })).toThrow(/dense/i);
  });

  test("keeps snapshot image as evidence, never an executable restore selection", () => {
    const { manifest, envelope, receipts } = completeEnvelope();
    const parsed = parseSnapshotEnvelope(envelope, receipts, manifest);
    expect(assertSnapshotImageEvidenceOnly(parsed)).toBeUndefined();
    expect(Object.keys(parsed)).not.toContain("restoreImageDigest");
  });
});
