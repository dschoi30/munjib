import { describe, expect, test } from "vitest";
import {
  qualifyCandidate,
  type CandidateQualificationInput,
} from "../../scripts/deploy/qualify-candidate";
import {
  verifyPrivateBindings,
  type PrivateBindingEvidence,
} from "../../scripts/deploy/verify-private-bindings";
import { revalidateBrokerOperation } from "../../scripts/deploy/reconcile-promotion";

const validBindings: PrivateBindingEvidence = {
  platform: "linux/arm64",
  image: "ghcr.io/dschoi30/munjib@sha256:" + "a".repeat(64),
  postgresImage: "pgvector/pgvector@sha256:" + "b".repeat(64),
  user: "10001:10001",
  networkMode: "private",
  networks: ["private"],
  readOnly: true,
  capDrop: ["ALL"],
  noNewPrivileges: true,
  tmpfs: ["/tmp", "/run"],
  listeners: ["127.0.0.1:3000"],
  caddyAdmin: "unix//run/caddy/admin.sock",
  postgresHostPorts: [],
  secrets: [
    { name: "nextauth-current", uid: 10001, gid: 10001, mode: "0400" },
    { name: "migrator-current", uid: 10001, gid: 10001, mode: "0400" },
  ],
};

const validCandidate: CandidateQualificationInput = {
  currentGeneration: "generation-41",
  candidateGeneration: "generation-42",
  appDigest: validBindings.image,
  postgresDigest: validBindings.postgresImage,
  hostBundleDigest: "sha256:" + "c".repeat(64),
  platform: "linux/arm64",
  attested: true,
  evidenceFresh: true,
  brokerRevalidated: true,
  migrationPrefixVerified: true,
  migrationPrefix: "20260707013000_add_workspace_archive",
  publicSmokeVerified: true,
  sideEffectsDisabled: true,
  bindings: validBindings,
  evidence: {
    appDigest: validBindings.image,
    postgresDigest: validBindings.postgresImage,
    hostBundleDigest: "sha256:" + "c".repeat(64),
    platform: "linux/arm64",
    generation: "generation-42",
    migrationPrefix: "20260707013000_add_workspace_archive",
    attestationBundleDigest: "sha256:" + "e".repeat(64),
    sbomDigest: "sha256:" + "f".repeat(64),
    provenanceDigest: "sha256:" + "1".repeat(64),
    testEvidenceDigest: "sha256:" + "2".repeat(64),
    signedBy: "kms:release-current",
  },
  brokerReceipt: {
    operation: "QUALIFY",
    envelopeDigest: "sha256:" + "3".repeat(64),
    receiptDigest: "sha256:" + "4".repeat(64),
    revalidated: true,
  },
};

describe("private blue/green candidate qualification", () => {
  test("accepts only exact, attested, side-effect-disabled private candidates", () => {
    expect(verifyPrivateBindings(validBindings)).toEqual({ ok: true });
    expect(qualifyCandidate(validCandidate)).toMatchObject({ ok: true, phase: "QUALIFIED" });
  });

  test.each([
    ["live candidate port", { listeners: ["0.0.0.0:3000"] }],
    ["IPv6 wildcard", { listeners: ["[::]:3000"] }],
    ["Caddy TCP admin", { caddyAdmin: "0.0.0.0:2019" }],
    ["secret mode drift", { secrets: [{ name: "nextauth-current", uid: 10001, gid: 10001, mode: "0644" }] }],
    ["user namespace drift", { user: "0:0" }],
    ["host network drift", { networkMode: "host" }],
    ["missing network binding", { networks: undefined }],
    ["unknown secret registry entry", { secrets: [{ name: "arbitrary", uid: 10001, gid: 10001, mode: "0400" }] }],
  ] as const)("rejects %s", (_label, patch) => {
    expect(verifyPrivateBindings({ ...validBindings, ...patch } as PrivateBindingEvidence)).toMatchObject({ ok: false });
  });

  test.each([
    ["tag image", { appDigest: "ghcr.io/dschoi30/munjib:latest" }],
    ["unattested image", { attested: false }],
    ["stale evidence", { evidenceFresh: false }],
    ["migration bypass", { migrationPrefixVerified: false }],
    ["public smoke bypass", { publicSmokeVerified: false }],
    ["broker bypass", { brokerRevalidated: false }],
    ["side effect", { sideEffectsDisabled: false }],
  ] as const)("rejects %s", (_label, patch) => {
    expect(qualifyCandidate({ ...validCandidate, ...patch })).toMatchObject({ ok: false });
  });

  test("rejects a candidate with missing signed evidence", () => {
    expect(qualifyCandidate({ ...validCandidate, evidence: undefined as never })).toMatchObject({ ok: false });
  });

  test("rejects caller-selected Docker paths, tags, ports, and commands", () => {
    const envelope = {
      operation: "PROMOTE" as const,
      appImage: "ghcr.io/dschoi30/munjib@sha256:" + "a".repeat(64),
      postgresImage: "pgvector/pgvector@sha256:" + "b".repeat(64),
      storageInitImage: "alpine@sha256:" + "c".repeat(64),
      hostBundleDigest: "sha256:" + "d".repeat(64),
      project: "munjib",
      network: "munjib_private",
      composeFiles: [
        "docker-compose.yml",
        "docker-compose.candidate.yml",
        "docker-compose.migrator.yml",
        "docker-compose.tools.yml",
      ],
      environment: {
        WEB_IMAGE: "ghcr.io/dschoi30/munjib@sha256:" + "a".repeat(64),
        POSTGRES_IMAGE: "pgvector/pgvector@sha256:" + "b".repeat(64),
        STORAGE_INIT_IMAGE: "alpine@sha256:" + "c".repeat(64),
        HOST_BUNDLE_DIGEST: "sha256:" + "d".repeat(64),
      },
      entrypoint: [],
      command: ["promote"],
      brokerRevalidated: true,
    };
    expect(revalidateBrokerOperation(envelope)).toEqual({ ok: true });
    expect(revalidateBrokerOperation({ ...envelope, appImage: "ghcr.io/dschoi30/munjib:latest" })).toMatchObject({ ok: false });
    expect(revalidateBrokerOperation({ ...envelope, hostPort: 3000 })).toMatchObject({ ok: false });
    expect(revalidateBrokerOperation({ ...envelope, command: ["docker compose up"] })).toMatchObject({ ok: false });
  });
});
