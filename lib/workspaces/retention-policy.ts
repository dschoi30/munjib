export const ARCHIVED_DOCUMENT_RETENTION_POLICIES = [
  { value: "NEVER", label: "Never", days: null },
  { value: "DAYS_7", label: "7 days", days: 7 },
  { value: "DAYS_30", label: "30 days", days: 30 },
  { value: "DAYS_90", label: "90 days", days: 90 },
] as const;

export type ArchivedDocumentRetentionPolicyValue =
  (typeof ARCHIVED_DOCUMENT_RETENTION_POLICIES)[number]["value"];

export const DEFAULT_ARCHIVED_DOCUMENT_RETENTION_POLICY: ArchivedDocumentRetentionPolicyValue =
  "DAYS_30";

const archivedDocumentRetentionPolicyValues = new Set<string>(
  ARCHIVED_DOCUMENT_RETENTION_POLICIES.map((policy) => policy.value),
);

export function isArchivedDocumentRetentionPolicy(
  value: unknown,
): value is ArchivedDocumentRetentionPolicyValue {
  return typeof value === "string" && archivedDocumentRetentionPolicyValues.has(value);
}

export function parseArchivedDocumentRetentionPolicy(
  value: FormDataEntryValue | null,
): ArchivedDocumentRetentionPolicyValue | null {
  if (!isArchivedDocumentRetentionPolicy(value)) {
    return null;
  }

  return value;
}

export function archivedDocumentRetentionDays(
  policy: ArchivedDocumentRetentionPolicyValue,
): number | null {
  return ARCHIVED_DOCUMENT_RETENTION_POLICIES.find((option) => option.value === policy)?.days ?? null;
}

export function archivedDocumentRetentionLabel(
  policy: ArchivedDocumentRetentionPolicyValue,
): string {
  return ARCHIVED_DOCUMENT_RETENTION_POLICIES.find((option) => option.value === policy)?.label ?? policy;
}

export function archivedDocumentRetentionCutoff(
  policy: ArchivedDocumentRetentionPolicyValue,
  now: Date,
): Date | null {
  const days = archivedDocumentRetentionDays(policy);

  if (days === null) {
    return null;
  }

  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
