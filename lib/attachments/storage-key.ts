import path from "node:path";

/**
 * Attachment storage keys are persisted relative paths, not arbitrary file
 * system paths. Keep this validation independent from the database and use it
 * before every path construction so a malformed legacy row cannot escape the
 * attachment root.
 */

const workspaceSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const attachmentFilePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-(.+)$/i;

export const ATTACHMENT_STORAGE_KEY_INVALID = "invalid-storage-key" as const;
export const ATTACHMENT_STORAGE_KEY_WORKSPACE_MISMATCH =
  "workspace-mismatch" as const;
export const ATTACHMENT_STORAGE_KEY_TRAVERSAL = "path-traversal" as const;
export const ATTACHMENT_STORAGE_KEY_DUPLICATE = "duplicate-storage-key" as const;

export type AttachmentStorageKeyIssue =
  | typeof ATTACHMENT_STORAGE_KEY_INVALID
  | typeof ATTACHMENT_STORAGE_KEY_WORKSPACE_MISMATCH
  | typeof ATTACHMENT_STORAGE_KEY_TRAVERSAL;

export type ValidatedAttachmentStorageKey = Readonly<{
  workspaceId: string;
  fileName: string;
}>;

export type AttachmentStorageKeyValidation =
  | Readonly<{ valid: true; value: ValidatedAttachmentStorageKey }>
  | Readonly<{ valid: false; issue: AttachmentStorageKeyIssue }>;

function invalid(issue: AttachmentStorageKeyIssue): AttachmentStorageKeyValidation {
  return Object.freeze({ valid: false, issue });
}

/**
 * Validate the canonical `<workspaceId>/<uuid>-<safeFileName>` representation.
 *
 * The check intentionally rejects Windows separators, control characters,
 * encoded-looking path segments, and absolute/parent paths even when running
 * on POSIX. `expectedWorkspaceId` is required by service callers that already
 * know the owning document workspace.
 */
export function validateAttachmentStorageKey(
  storageKey: unknown,
  expectedWorkspaceId?: string,
): AttachmentStorageKeyValidation {
  if (typeof storageKey !== "string" || storageKey.length === 0) {
    return invalid(ATTACHMENT_STORAGE_KEY_INVALID);
  }
  if (storageKey.includes("\\") || /[\u0000-\u001f\u007f]/.test(storageKey)) {
    return invalid(ATTACHMENT_STORAGE_KEY_TRAVERSAL);
  }
  if (path.posix.isAbsolute(storageKey) || /^[A-Za-z]:[\\/]/.test(storageKey)) {
    return invalid(ATTACHMENT_STORAGE_KEY_TRAVERSAL);
  }

  const segments = storageKey.split("/");
  if (
    segments.length !== 2 ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    return invalid(ATTACHMENT_STORAGE_KEY_TRAVERSAL);
  }

  const [workspaceId, fileName] = segments;
  if (!workspaceSegmentPattern.test(workspaceId)) {
    return invalid(ATTACHMENT_STORAGE_KEY_INVALID);
  }
  if (expectedWorkspaceId !== undefined && workspaceId !== expectedWorkspaceId) {
    return invalid(ATTACHMENT_STORAGE_KEY_WORKSPACE_MISMATCH);
  }

  const fileMatch = fileName.match(attachmentFilePattern);
  if (!fileMatch || fileMatch[1].length === 0 || fileMatch[1] === "." || fileMatch[1] === "..") {
    return invalid(ATTACHMENT_STORAGE_KEY_INVALID);
  }

  // `sanitizeFileName` permits only this character set. Re-asserting it at
  // read time makes old or manually-created rows fail closed rather than
  // relying on the writer having been the only source of keys.
  if (!/^[A-Za-z0-9._-]+$/.test(fileMatch[1])) {
    return invalid(ATTACHMENT_STORAGE_KEY_INVALID);
  }

  return Object.freeze({ valid: true, value: Object.freeze({ workspaceId, fileName }) });
}

/**
 * Build an attachment path only after validating the key and containment.
 * This is deliberately exported for read-only inventory/test callers; it does
 * not create, remove, or otherwise mutate files.
 */
export function resolveAttachmentStoragePath(
  storageRoot: string,
  storageKey: string,
  expectedWorkspaceId?: string,
): string {
  const validation = validateAttachmentStorageKey(storageKey, expectedWorkspaceId);
  if (!validation.valid) {
    throw new Error(`ATTACHMENT_STORAGE_KEY_INVALID:${validation.issue}`);
  }

  const root = path.resolve(storageRoot);
  const candidate = path.resolve(root, ...storageKey.split("/"));
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error("ATTACHMENT_STORAGE_KEY_INVALID:path-containment");
  }
  return candidate;
}
