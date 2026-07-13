import { readFileSync, renameSync, closeSync, fsyncSync, openSync, writeFileSync } from "node:fs";

export type PromotionPhase = "IDLE" | "PREPARED" | "TRAFFIC_SWITCHED" | "COMMITTED";
export type PromotionOperation = "PREPARE" | "SWITCH_TRAFFIC" | "COMMIT" | "ROLLBACK";

export interface PromotionState {
  generation: string;
  candidateGeneration: string;
  phase: PromotionPhase;
  currentDigest: string;
  candidateDigest: string;
  rollbackDigest: string;
  floor: number;
  candidateFloor?: number;
  rollbackFloor?: number;
  candidateQualified: boolean;
  privateBindingsVerified: boolean;
  migrationVerified: boolean;
  publicSmokeVerified: boolean;
  expectedCurrentGeneration: string;
  liveBackendGeneration?: string;
  liveBackendDigest?: string;
  pointerGeneration?: string;
  pointerDigest?: string;
  rollbackGeneration?: string;
  interruptedAt?: string;
  candidateRemoved?: boolean;
  maintenanceRequired?: boolean;
}

export interface ReconciledPromotionState extends PromotionState {
  candidateRemoved: boolean;
  maintenanceRequired: boolean;
}

export type PromotionSmoke =
  | "role"
  | "auth"
  | "rsc"
  | "rag"
  | "zero-egress"
  | "private-binding"
  | "candidate-caddy"
  | "log-sentinel"
  | "public"
  | "exact-backend"
  | "listener-inventory";

export interface BlueGreenPromotionActions {
  lock: () => void | Promise<void>;
  unlock: () => void | Promise<void>;
  verifyCurrent: (expectedGeneration: string) => void | Promise<void>;
  installHostBundle: (digest: string) => void | Promise<void>;
  runMigrator: (args: { imageDigest: string; searchPath: "pg_catalog,public,munjib_extensions"; discriminator: "munjib_schema_owner" }) => void | Promise<void>;
  finalizeOwnership: () => void | Promise<void>;
  stageCandidate: (state: PromotionState) => void | Promise<void>;
  runSmoke: (smoke: PromotionSmoke) => void | Promise<void>;
  fsync: (phase: PromotionPhase) => void | Promise<void>;
  switchBackend: (candidateGeneration: string) => void | Promise<void>;
  installPointers: (state: PromotionState) => void | Promise<void>;
  forceRecreateChangedServices: () => void | Promise<void>;
  removeCandidate: () => void | Promise<void>;
}

export interface BlueGreenPromotionInput extends PromotionState {
  hostBundleDigest?: string;
}

/**
 * Executes the fixed blue/green sequence. All privileged work is represented
 * by broker-owned actions; callers supply no Docker, systemd, path, or env
 * arguments. The action boundary makes every fsync/crash edge explicit.
 */
export async function promoteBlueGreen(
  state: BlueGreenPromotionInput,
  actions: BlueGreenPromotionActions,
): Promise<PromotionState> {
  let switched = false;
  await actions.lock();
  try {
    await actions.verifyCurrent(state.expectedCurrentGeneration);
    if (!state.candidateQualified || !state.privateBindingsVerified || !state.migrationVerified) {
      throw new Error("candidate qualification, private bindings, and migration admission are required");
    }
    if (state.hostBundleDigest && !/^sha256:[a-f0-9]{64}$/.test(state.hostBundleDigest)) {
      throw new Error("host bundle must be an exact digest");
    }
    if ((state.candidateFloor ?? state.floor) < state.floor) {
      throw new Error("candidate capability floor would lower the security floor");
    }
    if (state.hostBundleDigest) await actions.installHostBundle(state.hostBundleDigest);
    await actions.runMigrator({
      imageDigest: state.candidateDigest,
      searchPath: "pg_catalog,public,munjib_extensions",
      discriminator: "munjib_schema_owner",
    });
    await actions.finalizeOwnership();
    await actions.stageCandidate(state);
    for (const smoke of ["role", "auth", "rsc", "rag", "zero-egress", "private-binding", "candidate-caddy", "log-sentinel"] as const) {
      await actions.runSmoke(smoke);
    }
    const prepared = advancePromotion(state, "PREPARE");
    await actions.fsync("PREPARED");
    switched = true;
    await actions.switchBackend(prepared.candidateGeneration);
    const switchedState = advancePromotion(prepared, "SWITCH_TRAFFIC");
    await actions.fsync("TRAFFIC_SWITCHED");
    await actions.installPointers(switchedState);
    await actions.forceRecreateChangedServices();
    for (const smoke of ["public", "exact-backend", "listener-inventory"] as const) {
      await actions.runSmoke(smoke);
    }
    const committed = advancePromotion({ ...switchedState, publicSmokeVerified: true }, "COMMIT");
    await actions.fsync("COMMITTED");
    return committed;
  } catch (error) {
    if (!switched) {
      await actions.removeCandidate();
      return { ...state, phase: "IDLE", candidateRemoved: true };
    }
    return { ...state, phase: "TRAFFIC_SWITCHED", maintenanceRequired: true };
  } finally {
    await actions.unlock();
  }
}

function assertDigest(value: string, label: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be an exact digest`);
}

export function advancePromotion(state: PromotionState, operation: PromotionOperation): PromotionState {
  assertDigest(state.currentDigest, "current digest");
  assertDigest(state.candidateDigest, "candidate digest");
  assertDigest(state.rollbackDigest, "rollback digest");
  if (state.generation !== state.expectedCurrentGeneration) throw new Error("current generation changed");
  if (operation === "PREPARE") {
    if (state.phase !== "IDLE") throw new Error("candidate is already prepared");
    if (!state.candidateQualified || !state.privateBindingsVerified || !state.migrationVerified) {
      throw new Error("candidate qualification, private bindings, and migration admission are required");
    }
    if ((state.candidateFloor ?? state.floor) < state.floor) {
      throw new Error("candidate capability floor would lower the security floor");
    }
    return { ...state, phase: "PREPARED" };
  }
  if (operation === "SWITCH_TRAFFIC") {
    if (state.phase !== "PREPARED") throw new Error("traffic switch requires PREPARED state");
    return { ...state, phase: "TRAFFIC_SWITCHED" };
  }
  if (operation === "COMMIT") {
    if (state.phase !== "TRAFFIC_SWITCHED") throw new Error("commit requires TRAFFIC_SWITCHED state");
    if (!state.publicSmokeVerified) throw new Error("public smoke is required before commit");
    return {
      ...state,
      phase: "COMMITTED",
      generation: state.candidateGeneration,
      currentDigest: state.candidateDigest,
      rollbackDigest: state.currentDigest,
      floor: state.candidateFloor ?? state.floor,
      rollbackFloor: state.floor,
    };
  }
  if (operation === "ROLLBACK") {
    if ((state.rollbackFloor ?? 0) < state.floor) {
      throw new Error("rollback would lower the security floor");
    }
    if (!state.rollbackGeneration || state.rollbackGeneration === state.generation) {
      throw new Error("rollback generation evidence is missing or current");
    }
    if (state.phase !== "COMMITTED") throw new Error("rollback requires a committed generation");
    return { ...state, phase: "TRAFFIC_SWITCHED", publicSmokeVerified: false };
  }
  return state;
}

export function reconcilePromotion(state: PromotionState): ReconciledPromotionState {
  const backendMismatch = Boolean(
    state.liveBackendGeneration && state.pointerGeneration &&
      state.liveBackendGeneration !== state.pointerGeneration,
  ) || Boolean(
    state.liveBackendDigest && state.pointerDigest &&
      state.liveBackendDigest !== state.currentDigest,
  );
  if (backendMismatch) {
    return { ...state, candidateRemoved: false, maintenanceRequired: true };
  }
  if (state.interruptedAt === "before-switch" && (state.phase === "PREPARED" || state.phase === "IDLE")) {
    return { ...state, phase: "IDLE", candidateRemoved: true, maintenanceRequired: false };
  }
  if (state.interruptedAt === "after-switch" && state.phase === "TRAFFIC_SWITCHED") {
    return { ...state, candidateRemoved: false, maintenanceRequired: true };
  }
  return {
    ...state,
    candidateRemoved: state.candidateRemoved ?? false,
    maintenanceRequired: state.maintenanceRequired ?? false,
  };
}

export interface PromotionJournalRecord {
  format: "munjib-promotion-journal-v1";
  state: PromotionState;
  sequence: number;
  lastFsync: PromotionPhase;
}

export interface BrokerOperationEnvelope {
  operation: "QUALIFY" | "MIGRATE" | "PROMOTE" | "ROLLBACK" | "RESCAN";
  appImage: string;
  postgresImage: string;
  storageInitImage: string;
  hostBundleDigest: string;
  project: string;
  network: string;
  hostPort?: number;
  composeFiles: string[];
  environment: Record<string, string>;
  entrypoint: string[];
  command: string[];
  brokerRevalidated: boolean;
}

const FIXED_PROJECT = "munjib";
const FIXED_NETWORK = "munjib_private";
const FIXED_COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.candidate.yml",
  "docker-compose.migrator.yml",
  "docker-compose.tools.yml",
];
const FIXED_ENVIRONMENT_KEYS = new Set([
  "WEB_IMAGE",
  "POSTGRES_IMAGE",
  "STORAGE_INIT_IMAGE",
  "HOST_BUNDLE_DIGEST",
  "NEXTAUTH_URL",
  "MUNJIB_DEPLOYMENT_ENV",
]);

/** Revalidate the complete fixed broker operation, never caller-selected Docker arguments. */
export function revalidateBrokerOperation(envelope: BrokerOperationEnvelope): { ok: boolean; reason?: string } {
  if (!envelope || envelope.brokerRevalidated !== true) return { ok: false, reason: "broker revalidation missing" };
  if (!Object.values(["QUALIFY", "MIGRATE", "PROMOTE", "ROLLBACK", "RESCAN"]).includes(envelope.operation)) {
    return { ok: false, reason: "unknown broker operation" };
  }
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(envelope.appImage) || !/^.+@sha256:[a-f0-9]{64}$/.test(envelope.postgresImage) || !/^.+@sha256:[a-f0-9]{64}$/.test(envelope.storageInitImage) || !/^sha256:[a-f0-9]{64}$/.test(envelope.hostBundleDigest)) {
    return { ok: false, reason: "broker accepts exact image digests only" };
  }
  if (envelope.project !== FIXED_PROJECT || envelope.network !== FIXED_NETWORK) {
    return { ok: false, reason: "project/network are fixed" };
  }
  if (envelope.hostPort !== undefined) return { ok: false, reason: "host ports are not caller-selectable" };
  if (JSON.stringify(envelope.composeFiles) !== JSON.stringify(FIXED_COMPOSE_FILES)) {
    return { ok: false, reason: "compose file set is fixed" };
  }
  if (Object.keys(envelope.environment).some((key) => !FIXED_ENVIRONMENT_KEYS.has(key))) {
    return { ok: false, reason: "environment keys are not caller-selectable" };
  }
  if (
    envelope.environment.WEB_IMAGE !== envelope.appImage ||
    envelope.environment.POSTGRES_IMAGE !== envelope.postgresImage ||
    envelope.environment.STORAGE_INIT_IMAGE !== envelope.storageInitImage ||
    envelope.environment.HOST_BUNDLE_DIGEST !== envelope.hostBundleDigest
  ) {
    return { ok: false, reason: "environment values must exactly bind the signed artifacts" };
  }
  if (envelope.entrypoint.length !== 0 || envelope.command.some((value) => /checkout|build|docker\s+compose|systemctl|\.\./i.test(value))) {
    return { ok: false, reason: "entrypoint/command is not an approved fixed operation" };
  }
  for (const path of envelope.composeFiles) {
    if (path.includes("..") || path.startsWith("/") || path.includes("\\")) {
      return { ok: false, reason: "compose paths must be fixed relative names" };
    }
  }
  return { ok: true };
}

/** Atomically writes a regular state record; callers hold the global broker lock. */
export function writePromotionRecord(path: string, record: PromotionJournalRecord): void {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(record) + "\n", { mode: 0o600 });
  const descriptor = openSync(temporary, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, path);
  const directory = openSync(path.substring(0, path.lastIndexOf("/") || 1), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

export function readPromotionRecord(path: string): PromotionJournalRecord {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as PromotionJournalRecord;
  if (parsed.format !== "munjib-promotion-journal-v1" || !parsed.state || !Number.isInteger(parsed.sequence)) {
    throw new Error("invalid promotion journal");
  }
  return parsed;
}
