/**
 * Dependency-safe primitives for reauthorizing derived Workspace AI history.
 *
 * This module is intentionally independent of Prisma, routes, telemetry, and
 * authorization storage. The eventual caller must supply the canonical
 * database-time source authority through `authorizeSource`. An absent or
 * malformed lineage record is treated as legacy/unproven and therefore cannot
 * be replayed.
 */

export const AI_HISTORY_LINEAGE_VERSION = 1 as const;
export const AI_HISTORY_SOURCE_FREE_PROOF = "source-free-v1" as const;

export type AiHistorySource = Readonly<{
  documentId: string;
  chunkId: string;
}>;

export type AiHistoryLineage =
  | Readonly<{
      kind: "source-backed";
      version: typeof AI_HISTORY_LINEAGE_VERSION;
      sources: readonly AiHistorySource[];
    }>
  | Readonly<{
      kind: "source-free";
      version: typeof AI_HISTORY_LINEAGE_VERSION;
      proof: typeof AI_HISTORY_SOURCE_FREE_PROOF;
    }>
  | Readonly<{
      kind: "legacy-unproven";
    }>;

export type AiHistoryVisibilityDecision =
  | Readonly<{
      visibility: "visible";
      lineage: Exclude<AiHistoryLineage, { kind: "legacy-unproven" }>;
    }>
  | Readonly<{
      visibility: "tombstone";
    }>;

export type AiHistoryMessageRecord = Readonly<{
  id: string;
  role: string;
  content: string;
  citations: unknown;
  contextMeta: unknown;
  model: string | null;
  createdAt: Date;
}>;

export type AiHistoryVisibleMessageDto = Readonly<{
  visibility: "visible";
  id: string;
  role: string;
  content: string;
  citations: unknown;
  contextMeta: unknown;
  model: string | null;
  createdAt: string;
}>;

/**
 * A hidden derived turn intentionally has no identifier, timestamp, content,
 * citations, context metadata, model, source ids, counts, or denial reason.
 * Keeping this shape stable lets a future thread endpoint render a blank
 * placeholder without enumerating which source became unreadable.
 */
export type AiHistoryTombstoneDto = Readonly<{
  visibility: "tombstone";
  role: "ASSISTANT";
  content: "";
  citations: readonly [];
  contextMeta: null;
  model: null;
  createdAt: null;
}>;

export type AiHistoryMessageDto = AiHistoryVisibleMessageDto | AiHistoryTombstoneDto;

const LEGACY_UNPROVEN: AiHistoryLineage = { kind: "legacy-unproven" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseSource(value: unknown): AiHistorySource | null {
  if (!isRecord(value) || !nonEmptyString(value.documentId) || !nonEmptyString(value.chunkId)) {
    return null;
  }

  return {
    documentId: value.documentId.trim(),
    chunkId: value.chunkId.trim(),
  };
}

/**
 * Parse only the explicit v1 lineage contract. Existing context metadata that
 * merely contains citation ids is deliberately not inferred as proof.
 */
export function parseAiHistoryLineage(contextMeta: unknown): AiHistoryLineage {
  if (!isRecord(contextMeta) || !isRecord(contextMeta.lineage)) {
    return LEGACY_UNPROVEN;
  }

  const lineage = contextMeta.lineage;
  if (lineage.version !== AI_HISTORY_LINEAGE_VERSION || typeof lineage.kind !== "string") {
    return LEGACY_UNPROVEN;
  }

  if (
    lineage.kind === "source-free" &&
    lineage.proof === AI_HISTORY_SOURCE_FREE_PROOF
  ) {
    return {
      kind: "source-free",
      version: AI_HISTORY_LINEAGE_VERSION,
      proof: AI_HISTORY_SOURCE_FREE_PROOF,
    };
  }

  if (lineage.kind !== "source-backed" || !Array.isArray(lineage.sources)) {
    return LEGACY_UNPROVEN;
  }

  const sources = lineage.sources.map(parseSource);
  if (sources.length === 0 || sources.some((source): source is null => source === null)) {
    return LEGACY_UNPROVEN;
  }

  return {
    kind: "source-backed",
    version: AI_HISTORY_LINEAGE_VERSION,
    sources: sources as AiHistorySource[],
  };
}

/**
 * Apply current source authority to a parsed lineage record. Every source must
 * be authorized; one denied or missing source hides the entire derived turn.
 */
export function decideAiHistoryVisibility(input: {
  lineage: AiHistoryLineage;
  authorizeSource: (source: AiHistorySource) => boolean;
}): AiHistoryVisibilityDecision {
  if (input.lineage.kind === "legacy-unproven") {
    return { visibility: "tombstone" };
  }

  if (input.lineage.kind === "source-free") {
    return { visibility: "visible", lineage: input.lineage };
  }

  if (!input.lineage.sources.every(input.authorizeSource)) {
    return { visibility: "tombstone" };
  }

  return { visibility: "visible", lineage: input.lineage };
}

/**
 * Serialize a message only after `decideAiHistoryVisibility` has run. The
 * tombstone branch intentionally avoids copying any field from the persisted
 * row, including its internal id and source-bearing context metadata.
 */
export function toAiHistoryMessageDto(
  message: AiHistoryMessageRecord,
  decision: AiHistoryVisibilityDecision,
): AiHistoryMessageDto {
  if (decision.visibility === "tombstone") {
    return {
      visibility: "tombstone",
      role: "ASSISTANT",
      content: "",
      citations: [],
      contextMeta: null,
      model: null,
      createdAt: null,
    };
  }

  return {
    visibility: "visible",
    id: message.id,
    role: message.role,
    content: message.content,
    citations: message.citations,
    contextMeta: message.contextMeta,
    model: message.model,
    createdAt: message.createdAt.toISOString(),
  };
}
