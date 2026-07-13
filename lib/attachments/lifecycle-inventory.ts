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
  workspaceId: string;
  storageKey: string;
}>;

export type AttachmentLifecycleStorageFile = Readonly<{
  storageKey: string;
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
    attachmentCounts.set(
      attachment.storageKey,
      (attachmentCounts.get(attachment.storageKey) ?? 0) + 1,
    );
  }
  for (const file of input.files) {
    fileCounts.set(file.storageKey, (fileCounts.get(file.storageKey) ?? 0) + 1);
  }

  for (const attachment of [...input.attachments].sort((a, b) =>
    a.storageKey.localeCompare(b.storageKey),
  )) {
    const validation = validateAttachmentStorageKey(attachment.storageKey, attachment.workspaceId);
    const duplicate =
      (attachmentCounts.get(attachment.storageKey) ?? 0) > 1 ||
      (fileCounts.get(attachment.storageKey) ?? 0) > 1;
    const classification: AttachmentLifecycleClassification =
      !validation.valid || duplicate
        ? "invalid-key"
        : fileCounts.has(attachment.storageKey)
          ? "referenced"
          : "missing-bytes";
    const issue = !validation.valid
      ? validation.issue
      : duplicate
        ? "duplicate-storage-key"
        : undefined;
    entries.push({
      storageKey: attachment.storageKey,
      classification,
      ...(issue ? { issue } : {}),
    });
    counts[classification] += 1;
  }

  for (const file of [...input.files].sort((a, b) => a.storageKey.localeCompare(b.storageKey))) {
    const validation = validateAttachmentStorageKey(file.storageKey);
    const referenced = attachmentCounts.has(file.storageKey);
    const duplicate = (fileCounts.get(file.storageKey) ?? 0) > 1;
    if (!referenced && validation.valid && !duplicate) {
      entries.push({ storageKey: file.storageKey, classification: "orphan-bytes" });
      counts["orphan-bytes"] += 1;
    } else if (!validation.valid || duplicate) {
      entries.push({
        storageKey: file.storageKey,
        classification: "invalid-key",
        issue: !validation.valid ? validation.issue : "duplicate-storage-key",
      });
      counts["invalid-key"] += 1;
    }
  }

  entries.sort((a, b) => {
    const keyOrder = a.storageKey.localeCompare(b.storageKey);
    return keyOrder || a.classification.localeCompare(b.classification);
  });

  return Object.freeze({
    entries: Object.freeze(entries),
    counts: Object.freeze(counts),
    hasActionableFindings: counts["missing-bytes"] > 0 || counts["orphan-bytes"] > 0 || counts["invalid-key"] > 0,
    mutationAllowed: false,
  });
}
