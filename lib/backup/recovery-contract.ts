/**
 * Public, dependency-safe contract for the encrypted recovery program.
 *
 * This module deliberately describes obligations and ordering only. It does not
 * read production state, execute a snapshot/restore, or represent an acceptance
 * result. Runtime evidence is owned by the later backup/restore leaves.
 */

export const RECOVERY_CONTRACT_FORMAT = "munjib-recovery-readiness-v1" as const;
export const RECOVERY_CONTRACT_VERSION = 1 as const;

export const RECOVERY_DEPENDENCIES = Object.freeze({
  phaseA: Object.freeze(["leaf-13-broker-installed"]),
  phaseB: Object.freeze([
    "leaf-13b-deployed",
    "leaf-2-journal-ready",
    "leaf-9-purge-hooks",
    "leaf-11-attachment-lifecycle",
  ]),
});

export const RECOVERY_INVARIANTS = Object.freeze([
  "same-quiesced-epoch",
  "ciphertext-before-signature",
  "restore-never-production",
  "no-production-private-key",
  "snapshot-image-is-evidence-only",
]);

const SENSITIVE_KEY = /(?:password|secret|token|cookie|email|name|path|query|url|body|content|provider|private|credential|database|host|slug|title|document|attachment)/i;

const PHASE_MODES = ["MANUAL_ISOLATED", "CANDIDATE_ISOLATED"] as const;
type PhaseMode = (typeof PHASE_MODES)[number];

type RecoveryPhase = Readonly<{
  mode: PhaseMode;
  required: true;
  dependencies: readonly string[];
}>;

export type RecoveryReadinessContract = Readonly<{
  format: typeof RECOVERY_CONTRACT_FORMAT;
  version: typeof RECOVERY_CONTRACT_VERSION;
  objectives: Readonly<{
    rpoSeconds: 86400;
    rtoSeconds: 14400;
    retention: Readonly<{ daily: 7; weekly: 4; monthly: 3 }>;
  }>;
  phases: Readonly<{
    phaseA: RecoveryPhase;
    phaseB: RecoveryPhase;
  }>;
  invariants: readonly string[];
}>;

export class RecoveryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryContractError";
  }
}

function fail(message: string): never {
  throw new RecoveryContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${path} must be an object`);
  }
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
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
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`${path}.${key} is required`);
    }
  }
}

function assertLiteral<T extends string | number | boolean>(value: unknown, expected: T, path: string): asserts value is T {
  if (value !== expected) {
    fail(`${path} must equal ${JSON.stringify(expected)}`);
  }
}

function assertCanonicalArray(value: unknown, expected: readonly string[], path: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${path} must be an array of strings`);
  }
  if (value.length !== expected.length || value.some((item, index) => item !== expected[index])) {
    fail(`${path} has a non-canonical order or value`);
  }
  if (new Set(value).size !== value.length) {
    fail(`${path} must not contain duplicates`);
  }
  return Object.freeze([...value]);
}

function parsePhase(value: unknown, expectedMode: PhaseMode, expectedDependencies: readonly string[], path: string): RecoveryPhase {
  assertRecord(value, path);
  assertExactKeys(value, ["mode", "required", "dependencies"], path);
  assertLiteral(value.mode, expectedMode, `${path}.mode`);
  assertLiteral(value.required, true, `${path}.required`);
  const dependencies = assertCanonicalArray(value.dependencies, expectedDependencies, `${path}.dependencies`);
  return Object.freeze({ mode: expectedMode, required: true, dependencies });
}

/**
 * Parse the checked-in public contract or a separately loaded copy of it.
 *
 * The parser is intentionally fail-closed and returns a fresh immutable value;
 * callers cannot mutate the contract to make a later phase appear satisfied.
 */
export function parseRecoveryReadinessContract(value: unknown): RecoveryReadinessContract {
  assertRecord(value, "contract");
  assertExactKeys(value, ["format", "version", "objectives", "phases", "invariants"], "contract");
  assertLiteral(value.format, RECOVERY_CONTRACT_FORMAT, "contract.format");
  assertLiteral(value.version, RECOVERY_CONTRACT_VERSION, "contract.version");

  assertRecord(value.objectives, "contract.objectives");
  assertExactKeys(value.objectives, ["rpoSeconds", "rtoSeconds", "retention"], "contract.objectives");
  assertLiteral(value.objectives.rpoSeconds, 86400, "contract.objectives.rpoSeconds");
  assertLiteral(value.objectives.rtoSeconds, 14400, "contract.objectives.rtoSeconds");
  assertRecord(value.objectives.retention, "contract.objectives.retention");
  assertExactKeys(value.objectives.retention, ["daily", "weekly", "monthly"], "contract.objectives.retention");
  assertLiteral(value.objectives.retention.daily, 7, "contract.objectives.retention.daily");
  assertLiteral(value.objectives.retention.weekly, 4, "contract.objectives.retention.weekly");
  assertLiteral(value.objectives.retention.monthly, 3, "contract.objectives.retention.monthly");

  assertRecord(value.phases, "contract.phases");
  assertExactKeys(value.phases, ["phaseA", "phaseB"], "contract.phases");
  const phaseA = parsePhase(value.phases.phaseA, "MANUAL_ISOLATED", RECOVERY_DEPENDENCIES.phaseA, "contract.phases.phaseA");
  const phaseB = parsePhase(value.phases.phaseB, "CANDIDATE_ISOLATED", RECOVERY_DEPENDENCIES.phaseB, "contract.phases.phaseB");
  const invariants = assertCanonicalArray(value.invariants, RECOVERY_INVARIANTS, "contract.invariants");

  return Object.freeze({
    format: RECOVERY_CONTRACT_FORMAT,
    version: RECOVERY_CONTRACT_VERSION,
    objectives: Object.freeze({
      rpoSeconds: 86400,
      rtoSeconds: 14400,
      retention: Object.freeze({ daily: 7, weekly: 4, monthly: 3 }),
    }),
    phases: Object.freeze({ phaseA, phaseB }),
    invariants,
  });
}
