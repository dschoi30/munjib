import {
  validateAttachmentStorageKey,
  type AttachmentStorageKeyIssue,
} from "@/lib/attachments/storage-key";

export const ATTACHMENT_LIFECYCLE_CLASSIFICATIONS = Object.freeze([
  "referenced",
  "missing-bytes",
  "orphan-bytes",
  "invalid-key",
] as const);

export type AttachmentLifecycleClassification =
  (typeof ATTACHMENT_LIFECYCLE_CLASSIFICATIONS)[number];

export type AttachmentLifecycleMetadataRow = Readonly<{
  workspaceId: unknown;
  storageKey: unknown;
}>;

export type AttachmentLifecycleStorageFile = Readonly<{
  storageKey: unknown;
}>;

export type AttachmentLifecycleInventoryEntry = Readonly<{
  storageKey: string;
  classification: AttachmentLifecycleClassification;
  issue?: AttachmentStorageKeyIssue | "duplicate-storage-key";
}>;

export type AttachmentLifecycleInventory = Readonly<{
  entries: readonly AttachmentLifecycleInventoryEntry[];
  counts: Readonly<Record<AttachmentLifecycleClassification, number>>;
  hasActionableFindings: boolean;
  mutationAllowed: false;
}>;

const emptyCounts = (): Record<AttachmentLifecycleClassification, number> => ({
  referenced: 0,
  "missing-bytes": 0,
  "orphan-bytes": 0,
  "invalid-key": 0,
});

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function normalizeStorageKey(value: unknown): { value: string; isString: boolean } {
  return typeof value === "string"
    ? { value, isString: true }
    : { value: "[invalid-storage-key]", isString: false };
}

function validateMetadataKey(
  storageKey: unknown,
  workspaceId: unknown,
): ReturnType<typeof validateAttachmentStorageKey> {
  const normalized = normalizeStorageKey(storageKey);
  if (!normalized.isString || typeof workspaceId !== "string") {
    return { valid: false, issue: "invalid-storage-key" };
  }
  return validateAttachmentStorageKey(normalized.value, workspaceId);
}

/**
 * Reconcile attachment metadata against a file manifest without touching the
 * database or filesystem. Inputs and output are sorted by storage key so a
 * repeated read-only pass can be compared deterministically.
 */
export function reconcileAttachmentLifecycleInventory(input: {
  attachments: readonly AttachmentLifecycleMetadataRow[];
  files: readonly AttachmentLifecycleStorageFile[];
}): AttachmentLifecycleInventory {
  const entries: AttachmentLifecycleInventoryEntry[] = [];
  const counts = emptyCounts();
  const attachmentCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const attachment of input.attachments) {
    const storageKey = normalizeStorageKey(attachment.storageKey).value;
    if (validateMetadataKey(attachment.storageKey, attachment.workspaceId).valid) {
      attachmentCounts.set(
        storageKey,
        (attachmentCounts.get(storageKey) ?? 0) + 1,
      );
    }
  }
  for (const file of input.files) {
    const storageKey = normalizeStorageKey(file.storageKey).value;
    fileCounts.set(storageKey, (fileCounts.get(storageKey) ?? 0) + 1);
  }

  for (const attachment of [...input.attachments].sort((a, b) =>
    compareCodeUnits(
      normalizeStorageKey(a.storageKey).value,
      normalizeStorageKey(b.storageKey).value,
    ),
  )) {
    const storageKey = normalizeStorageKey(attachment.storageKey).value;
    const validation = validateMetadataKey(attachment.storageKey, attachment.workspaceId);
    const duplicate =
      (attachmentCounts.get(storageKey) ?? 0) > 1 || (fileCounts.get(storageKey) ?? 0) > 1;
    const classification: AttachmentLifecycleClassification =
      !validation.valid || duplicate
        ? "invalid-key"
        : fileCounts.has(storageKey)
          ? "referenced"
          : "missing-bytes";
    const issue = !validation.valid
      ? validation.issue
      : duplicate
        ? "duplicate-storage-key"
        : undefined;
    entries.push({
      storageKey,
      classification,
      ...(issue ? { issue } : {}),
    });
    counts[classification] += 1;
  }

  for (const file of [...input.files].sort((a, b) =>
    compareCodeUnits(normalizeStorageKey(a.storageKey).value, normalizeStorageKey(b.storageKey).value),
  )) {
    const storageKey = normalizeStorageKey(file.storageKey);
    const validation = storageKey.isString
      ? validateAttachmentStorageKey(storageKey.value)
      : { valid: false as const, issue: "invalid-storage-key" as const };
    const referenced = attachmentCounts.has(storageKey.value);
    const duplicate = (fileCounts.get(storageKey.value) ?? 0) > 1;
    if (!referenced && validation.valid && !duplicate) {
      entries.push({ storageKey: storageKey.value, classification: "orphan-bytes" });
      counts["orphan-bytes"] += 1;
    } else if (!validation.valid || duplicate) {
      entries.push({
        storageKey: storageKey.value,
        classification: "invalid-key",
        issue: !validation.valid ? validation.issue : "duplicate-storage-key",
      });
      counts["invalid-key"] += 1;
    }
  }

  entries.sort((a, b) => {
    const keyOrder = compareCodeUnits(a.storageKey, b.storageKey);
    const classificationOrder = compareCodeUnits(a.classification, b.classification);
    return keyOrder || classificationOrder || compareCodeUnits(a.issue ?? "", b.issue ?? "");
  });

  return Object.freeze({
    entries: Object.freeze(entries),
    counts: Object.freeze(counts),
    hasActionableFindings: counts["missing-bytes"] > 0 || counts["orphan-bytes"] > 0 || counts["invalid-key"] > 0,
    mutationAllowed: false,
  });
}
