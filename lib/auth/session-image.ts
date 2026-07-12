/**
 * Returns a canonical internal attachment URL only when the caller has an
 * immutable, server-resolved attachment allowlist.
 */
export function sanitizeInternalSessionImage(
  value: unknown,
  authorizedAttachmentIds?: ReadonlySet<string> | readonly string[] | null,
): string | null {
  const ids = new Set(authorizedAttachmentIds ?? []);
  if (ids.size === 0) return null;
  const decodedId = extractInternalAttachmentId(value);
  if (!decodedId || !ids.has(decodedId)) return null;
  return `/api/attachments/${decodedId}`;
}

/** Parse only the canonical internal attachment path; authorization is separate. */
export function extractInternalAttachmentId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/api/attachments/") || value.includes("?") || value.includes("#")) {
    return null;
  }
  const rawId = value.slice("/api/attachments/".length);
  if (!rawId || rawId.includes("/") || rawId.includes("\\")) return null;
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  if (
    !decodedId ||
    decodedId.includes("/") ||
    decodedId.includes("\\") ||
    decodedId.includes("?") ||
    decodedId.includes("#") ||
    !/^[A-Za-z0-9_-]+$/.test(decodedId)
  ) {
    return null;
  }
  return decodedId;
}

/** Remove provider-controlled media claims before a token can be persisted. */
export function sanitizeGoogleJwtToken<T extends Record<string, unknown>>(token: T): T {
  const reduced = { ...token };
  delete reduced.picture;
  delete reduced.image;
  return reduced;
}
