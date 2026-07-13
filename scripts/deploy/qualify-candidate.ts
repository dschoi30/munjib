import { readFileSync } from "node:fs";
import {
  verifyPrivateBindings,
  type PrivateBindingEvidence,
} from "./verify-private-bindings";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IMAGE_DIGEST = /@sha256:[a-f0-9]{64}$/;

export interface CandidateQualificationInput {
  currentGeneration: string;
  candidateGeneration: string;
  appDigest: string;
  postgresDigest: string;
  hostBundleDigest: string;
  platform: string;
  attested: boolean;
  evidenceFresh: boolean;
  evidenceGeneration?: string;
  expectedEvidenceGeneration?: string;
  brokerRevalidated: boolean;
  migrationPrefixVerified: boolean;
  migrationPrefix: string;
  expectedMigrationPrefix?: string;
  publicSmokeVerified: boolean;
  sideEffectsDisabled: boolean;
  bindings: PrivateBindingEvidence;
  evidence: CandidateEvidence;
  brokerReceipt: BrokerQualificationReceipt;
}

export interface CandidateEvidence {
  appDigest: string;
  postgresDigest: string;
  hostBundleDigest: string;
  platform: "linux/arm64";
  generation: string;
  migrationPrefix: string;
  attestationBundleDigest: string;
  sbomDigest: string;
  provenanceDigest: string;
  testEvidenceDigest: string;
  signedBy: `kms:${string}`;
}

export interface BrokerQualificationReceipt {
  operation: "QUALIFY";
  envelopeDigest: string;
  receiptDigest: string;
  revalidated: true;
}

export type CandidateQualificationResult = {
  ok: boolean;
  phase: "REJECTED" | "QUALIFIED";
  reason?: string;
};

function reject(reason: string): CandidateQualificationResult {
  return { ok: false, phase: "REJECTED", reason };
}

export function qualifyCandidate(input: CandidateQualificationInput): CandidateQualificationResult {
  if (!input || typeof input !== "object") return reject("candidate envelope is missing");
  if (!input.currentGeneration || !input.candidateGeneration || input.currentGeneration === input.candidateGeneration) {
    return reject("candidate generation must differ from the expected current generation");
  }
  if (!IMAGE_DIGEST.test(input.appDigest) || !IMAGE_DIGEST.test(input.postgresDigest) || !DIGEST.test(input.hostBundleDigest)) {
    return reject("all release artifacts must be addressed by exact digest");
  }
  if (input.platform !== "linux/arm64") return reject("candidate platform is not native ARM64");
  if (!input.evidence || !input.brokerReceipt) return reject("signed evidence and broker receipt are required");
  if (
    input.evidence.appDigest !== input.appDigest ||
    input.evidence.postgresDigest !== input.postgresDigest ||
    input.evidence.hostBundleDigest !== input.hostBundleDigest ||
    input.evidence.platform !== input.platform ||
    input.evidence.generation !== input.candidateGeneration ||
    input.evidence.migrationPrefix !== (input.expectedMigrationPrefix ?? input.migrationPrefix)
  ) {
    return reject("signed evidence does not bind the candidate artifacts");
  }
  for (const digest of [
    input.evidence.attestationBundleDigest,
    input.evidence.sbomDigest,
    input.evidence.provenanceDigest,
    input.evidence.testEvidenceDigest,
  ]) {
    if (!DIGEST.test(digest)) return reject("signed evidence digest is invalid");
  }
  if (!input.evidence.signedBy.startsWith("kms:")) return reject("release evidence signer is not approved");
  if (
    input.brokerReceipt.operation !== "QUALIFY" ||
    input.brokerReceipt.revalidated !== true ||
    !DIGEST.test(input.brokerReceipt.envelopeDigest) ||
    !DIGEST.test(input.brokerReceipt.receiptDigest)
  ) {
    return reject("broker qualification receipt is invalid");
  }
  if (input.attested !== true) return reject("artifact attestation is missing");
  if (input.evidenceFresh !== true) return reject("release evidence is stale or mismatched");
  if (input.expectedEvidenceGeneration && input.evidenceGeneration !== input.expectedEvidenceGeneration) {
    return reject("release evidence generation does not match the candidate");
  }
  if (input.brokerRevalidated !== true) return reject("broker envelope revalidation is required");
  if (input.migrationPrefixVerified !== true) return reject("migration prefix admission is required");
  if (input.expectedMigrationPrefix && input.migrationPrefix !== input.expectedMigrationPrefix) {
    return reject("migration prefix evidence does not match the candidate");
  }
  if (input.publicSmokeVerified !== true) return reject("candidate public smoke evidence is required");
  if (input.sideEffectsDisabled !== true) return reject("candidate side effects are not disabled");
  const bindings = verifyPrivateBindings(input.bindings);
  if (!bindings.ok) return reject(bindings.reason ?? "private binding verification failed");
  if (input.bindings.image !== input.appDigest || input.bindings.postgresImage !== input.postgresDigest) {
    return reject("candidate binding digests do not match the signed envelope");
  }
  return { ok: true, phase: "QUALIFIED" };
}

export function readCandidateQualification(path: string): CandidateQualificationInput {
  return JSON.parse(readFileSync(path, "utf8")) as CandidateQualificationInput;
}

if (process.argv[1]?.endsWith("qualify-candidate.ts")) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write("usage: qualify-candidate.ts <candidate.json>\n");
    process.exitCode = 2;
  } else {
    const result = qualifyCandidate(readCandidateQualification(path));
    process.stdout.write(JSON.stringify(result) + "\n");
    if (!result.ok) process.exitCode = 1;
  }
}
