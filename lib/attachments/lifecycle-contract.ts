/**
 * Public, dependency-safe contract for the attachment lifecycle hardening lane.
 *
 * This module describes the ordering and non-destructive boundaries only. It
 * does not inspect production storage, delete files, alter attachment rows, or
 * claim that any dependency is deployed.
 */

export const ATTACHMENT_LIFECYCLE_CONTRACT_FORMAT =
  "munjib-attachment-lifecycle-readiness-v1" as const;
export const ATTACHMENT_LIFECYCLE_CONTRACT_VERSION = 1 as const;

export const ATTACHMENT_LIFECYCLE_DEPENDENCIES = Object.freeze({
  phaseA: Object.freeze([
    "issue-2-document-crud",
    "issue-4-editor-paste",
    "issue-5-link-reconciliation",
    "issue-6-document-authorization",
    "leaf-13b-database-authority",
  ]),
  phaseB: Object.freeze([
    "issue-2-document-crud",
    "issue-4-editor-paste",
    "issue-5-link-reconciliation",
    "issue-6-document-authorization",
    "leaf-13b-database-authority",
    "issue-164-ai-provider-policy-v2",
  ]),
});

export const ATTACHMENT_LIFECYCLE_ACTIONS = Object.freeze({
  phaseA: Object.freeze([
    "inventory-db-rows",
    "verify-storage-key-shape",
    "dry-run-reconcile",
  ]),
  phaseB: Object.freeze([
    "quiesce-attachment-writes",
    "manifest-db-and-files",
    "restore-never-production",
  ]),
});

export const ATTACHMENT_LIFECYCLE_INVARIANTS = Object.freeze([
  "attachment-row-document-workspace-must-match",
  "storage-key-is-workspace-scoped-and-path-safe",
  "v1-never-deletes-attachment-bytes",
  "purge-is-idempotent-and-audited",
  "no-production-mutation-before-dependency-attestation",
]);

export const ATTACHMENT_LIFECYCLE_DEFERRED = Object.freeze([
  "production-orphan-gc",
  "document-purge-cascade-file-cleanup",
  "pending-paste-expiry",
  "ai-history-attachment-reference-policy-v2",
]);

const SENSITIVE_KEY =
  /(?:password|secret|token|cookie|email|name|path|query|url|body|content|provider|private|credential|database|host|slug|title|document|attachment)/i;

const PHASE_MODES = ["PREPARATION_ONLY", "CANDIDATE_ISOLATED"] as const;
type PhaseMode = (typeof PHASE_MODES)[number];

type AttachmentLifecyclePhase = Readonly<{
  mode: PhaseMode;
  required: true;
  dependencies: readonly string[];
  allowedActions: readonly string[];
}>;

export type AttachmentLifecycleReadinessContract = Readonly<{
  format: typeof ATTACHMENT_LIFECYCLE_CONTRACT_FORMAT;
  version: typeof ATTACHMENT_LIFECYCLE_CONTRACT_VERSION;
  phases: Readonly<{
    phaseA: AttachmentLifecyclePhase;
    phaseB: AttachmentLifecyclePhase;
  }>;
  invariants: readonly string[];
  deferred: readonly string[];
}>;

export class AttachmentLifecycleContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentLifecycleContractError";
  }
}

function fail(message: string): never {
  throw new AttachmentLifecycleContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${path} must be an object`);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) {
      if (SENSITIVE_KEY.test(key)) {
        fail(`${path}.${key} is a sensitive or forbidden field`);
      }
      fail(`${path}.${key} is an unknown field`);
    }
  }
  for (const key of expected) {
    if (!(key in value)) fail(`${path}.${key} is required`);
  }
}

function assertLiteral<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): asserts value is T {
  if (value !== expected) fail(`${path} must equal ${JSON.stringify(expected)}`);
}

function assertCanonicalArray(
  value: unknown,
  expected: readonly string[],
  path: string,
): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${path} must be an array of strings`);
  }
  if (value.length !== expected.length || value.some((item, index) => item !== expected[index])) {
    fail(`${path} has a non-canonical order or value`);
  }
  if (new Set(value).size !== value.length) fail(`${path} must not contain duplicates`);
  return Object.freeze([...value]);
}

function parsePhase(
  value: unknown,
  expectedMode: PhaseMode,
  expectedDependencies: readonly string[],
  expectedActions: readonly string[],
  path: string,
): AttachmentLifecyclePhase {
  assertRecord(value, path);
  assertExactKeys(value, ["mode", "required", "dependencies", "allowedActions"], path);
  assertLiteral(value.mode, expectedMode, `${path}.mode`);
  assertLiteral(value.required, true, `${path}.required`);
  const dependencies = assertCanonicalArray(
    value.dependencies,
    expectedDependencies,
    `${path}.dependencies`,
  );
  const allowedActions = assertCanonicalArray(
    value.allowedActions,
    expectedActions,
    `${path}.allowedActions`,
  );
  return Object.freeze({ mode: expectedMode, required: true, dependencies, allowedActions });
}

/**
 * Parse the checked-in public contract or a separately loaded copy.
 *
 * The parser is fail-closed and returns a fresh immutable value. It validates
 * dependency ordering but intentionally does not assert that dependencies are
 * deployed; deployment attestation belongs to the later broker-controlled leaf.
 */
export function parseAttachmentLifecycleReadinessContract(
  value: unknown,
): AttachmentLifecycleReadinessContract {
  assertRecord(value, "contract");
  assertExactKeys(value, ["format", "version", "phases", "invariants", "deferred"], "contract");
  assertLiteral(value.format, ATTACHMENT_LIFECYCLE_CONTRACT_FORMAT, "contract.format");
  assertLiteral(value.version, ATTACHMENT_LIFECYCLE_CONTRACT_VERSION, "contract.version");

  assertRecord(value.phases, "contract.phases");
  assertExactKeys(value.phases, ["phaseA", "phaseB"], "contract.phases");
  const phaseA = parsePhase(
    value.phases.phaseA,
    "PREPARATION_ONLY",
    ATTACHMENT_LIFECYCLE_DEPENDENCIES.phaseA,
    ATTACHMENT_LIFECYCLE_ACTIONS.phaseA,
    "contract.phases.phaseA",
  );
  const phaseB = parsePhase(
    value.phases.phaseB,
    "CANDIDATE_ISOLATED",
    ATTACHMENT_LIFECYCLE_DEPENDENCIES.phaseB,
    ATTACHMENT_LIFECYCLE_ACTIONS.phaseB,
    "contract.phases.phaseB",
  );
  const invariants = assertCanonicalArray(
    value.invariants,
    ATTACHMENT_LIFECYCLE_INVARIANTS,
    "contract.invariants",
  );
  const deferred = assertCanonicalArray(
    value.deferred,
    ATTACHMENT_LIFECYCLE_DEFERRED,
    "contract.deferred",
  );

  return Object.freeze({
    format: ATTACHMENT_LIFECYCLE_CONTRACT_FORMAT,
    version: ATTACHMENT_LIFECYCLE_CONTRACT_VERSION,
    phases: Object.freeze({ phaseA, phaseB }),
    invariants,
    deferred,
  });
}
