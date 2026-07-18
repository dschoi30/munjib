import { AsyncLocalStorage } from "node:async_hooks";

export type CandidatePersistenceState = "EMPTY" | "READY" | "CREATED" | "ACKNOWLEDGED" | "CLOSED";

export type CandidatePersistenceContextData = {
  callbackNonce: string;
  purpose: "GOOGLE_CANDIDATE";
  grantId: string;
  normalizedEmail: string;
  provider: "google";
  providerAccountId: string;
  expectedUserId?: string;
  expectedSessionId?: string;
};

const candidateContextBrand = Symbol("candidate-context-brand");
export type CandidatePersistenceContext = CandidatePersistenceContextData & {
  readonly [candidateContextBrand]: true;
};

export type CandidatePersistenceCell = {
  readonly state: CandidatePersistenceState;
  readonly context?: CandidatePersistenceContext;
  readonly spent: boolean;
};

type MutableCell = {
  state: CandidatePersistenceState;
  context?: CandidatePersistenceContext;
  spent: boolean;
};

const requestScope = new AsyncLocalStorage<MutableCell>();
const initializer = Symbol("candidate-context-initializer");

export async function runCandidatePersistenceRequestScope<T>(
  callback: () => T | Promise<T>,
): Promise<T> {
  const cell: MutableCell = { state: "EMPTY", spent: false };
  return requestScope.run(cell, async () => {
    try {
      return await callback();
    } finally {
      cell.state = "CLOSED";
      cell.spent = true;
      cell.context = undefined;
    }
  });
}

export function getCandidatePersistenceCell(): CandidatePersistenceCell | undefined {
  const cell = requestScope.getStore();
  return cell ? { state: cell.state, context: cell.context, spent: cell.spent } : undefined;
}

export const getCurrentCandidatePersistenceCell = getCandidatePersistenceCell;

export function readCandidatePersistenceContext(): CandidatePersistenceContext | null {
  const cell = requestScope.getStore();
  return cell?.state === "READY" || cell?.state === "CREATED" || cell?.state === "ACKNOWLEDGED"
    ? cell.context ?? null
    : null;
}

export const getCurrentCandidatePersistenceContext = readCandidatePersistenceContext;

export function closeCandidatePersistenceRequestScope() {
  const cell = requestScope.getStore();
  if (!cell) return false;
  cell.state = "CLOSED";
  cell.spent = true;
  cell.context = undefined;
  return true;
}

export const closeCandidatePersistenceScope = closeCandidatePersistenceRequestScope;

/** Internal guarded initializer reserved for the Leaf 7 grant implementation. */
export function initializeCandidatePersistenceContext(
  token: typeof initializer,
  input: CandidatePersistenceContextData,
): CandidatePersistenceContext | null {
  if (token !== initializer) return null;
  const cell = requestScope.getStore();
  if (!cell || cell.state !== "EMPTY" || cell.spent) return null;
  const context = Object.freeze({ ...input, [candidateContextBrand]: true }) as CandidatePersistenceContext;
  cell.context = context;
  cell.state = "READY";
  return context;
}

export function transitionCandidatePersistenceContext(
  expected: Exclude<CandidatePersistenceState, "EMPTY" | "CLOSED">,
  next: Exclude<CandidatePersistenceState, "EMPTY" | "CLOSED">,
  context: CandidatePersistenceContext,
): boolean {
  const cell = requestScope.getStore();
  if (!cell || cell.context !== context || cell.state !== expected || cell.spent) return false;
  if (
    expected === "ACKNOWLEDGED" ||
    (expected === "READY" && next !== "CREATED" && next !== "ACKNOWLEDGED") ||
    (expected === "CREATED" && next !== "ACKNOWLEDGED")
  ) {
    return false;
  }
  cell.state = next;
  return true;
}
