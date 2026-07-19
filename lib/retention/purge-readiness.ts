import type { Prisma } from "@prisma/client";

export const PURGE_LEAF_NAMES = ["ai-lineage", "attachments"] as const;
export type PurgeLeafName = (typeof PURGE_LEAF_NAMES)[number];

export type PurgeBatchCandidate = Readonly<{
  rootOperationId: string;
  workspaceId: string;
  documentIds: readonly string[];
}>;

export type PurgePhysicalCandidate = Readonly<{
  rootOperationId: string;
  ledgerItemId: string;
  workspaceId: string;
  documentId: string;
  journalFence: Readonly<{ sequence: string; hash: string }>;
  signedHighWaterSha256: string;
}>;

export type PurgeEvaluationState = Readonly<Record<string, unknown>>;

export type PurgeAuthorization = Readonly<Record<string, unknown>>;

export interface PurgeLeafReadiness {
  readonly name: PurgeLeafName;
  assertCandidate(
    tx: Prisma.TransactionClient,
    candidate: PurgeBatchCandidate,
    state: PurgeEvaluationState,
  ): Promise<void>;
}

export interface DestructivePurgeReadiness {
  authorizeLogicalBatch(
    tx: Prisma.TransactionClient,
    candidate: PurgeBatchCandidate,
  ): Promise<PurgeAuthorization>;
  authorizePhysicalItem(
    tx: Prisma.TransactionClient,
    candidate: PurgePhysicalCandidate,
  ): Promise<PurgeAuthorization>;
}

export interface PurgePhysicalExecutor {
  executeItem(input: {
    claimToken: string;
    ledgerItemId: string;
    rootOperationId: string;
  }): Promise<Readonly<Record<string, unknown>>>;
}

export function createCompositePurgeReadiness(_input: {
  readEvaluationState(
    tx: Prisma.TransactionClient,
    candidate: PurgeBatchCandidate,
  ): Promise<PurgeEvaluationState>;
  leafChecks: readonly PurgeLeafReadiness[];
}): DestructivePurgeReadiness {
  // A real composite is only safe once the independent journal, restore, and
  // provider evidence contracts are present.  Keep the API available while
  // making accidental production activation impossible.
  return failClosedPurgeReadiness;
}

export const failClosedPurgeReadiness: DestructivePurgeReadiness = Object.freeze({
  async authorizeLogicalBatch() {
    throw new Error("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED");
  },
  async authorizePhysicalItem() {
    throw new Error("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED");
  },
});

export const failClosedPurgePhysicalExecutor: PurgePhysicalExecutor = Object.freeze({
  async executeItem() {
    throw new Error("DESTRUCTIVE_PURGE_PHYSICAL_INTEGRATION_NOT_INSTALLED");
  },
});
