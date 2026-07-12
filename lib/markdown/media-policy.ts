export type MarkdownImageDecision =
  | { kind: "attachment"; attachmentId: string; src: string }
  | { kind: "external"; href: string; originLabel: string }
  | { kind: "blocked" };

const attachmentPath = /^\/api\/attachments\/([A-Za-z0-9_-]+)$/;
const FIXED_RELATIVE_URL_SENTINEL = new URL("https://munjib-relative.invalid/");
const absoluteScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const forbiddenRawUrlCodePoint = /[\\\u0000-\u001F\u007F-\u009F]/u;

function parseHttpUrl(candidate: string, allowRelative: boolean) {
  if (
    !candidate ||
    forbiddenRawUrlCodePoint.test(candidate) ||
    candidate.startsWith("//")
  ) return null;
  let url: URL;
  try {
    url = new URL(candidate, FIXED_RELATIVE_URL_SENTINEL);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== ""
  ) return null;
  const parsedAsRelative = url.origin === FIXED_RELATIVE_URL_SENTINEL.origin;
  if (!allowRelative && parsedAsRelative) return null;
  if (parsedAsRelative && absoluteScheme.test(candidate)) return null;
  if (parsedAsRelative) {
    const canonicalRelative = `${url.pathname}${url.search}${url.hash}`;
    const roundTrip = new URL(canonicalRelative, FIXED_RELATIVE_URL_SENTINEL);
    if (
      roundTrip.origin !== FIXED_RELATIVE_URL_SENTINEL.origin ||
      roundTrip.href !== url.href ||
      roundTrip.username !== "" ||
      roundTrip.password !== ""
    ) return null;
  }
  return { url, parsedAsRelative };
}

export function classifyMarkdownImageSource(
  src: string | undefined,
  allowedAttachmentIds: ReadonlySet<string>,
): MarkdownImageDecision {
  if (!src) return { kind: "blocked" };

  const attachmentMatch = src.match(attachmentPath);
  if (attachmentMatch) {
    const attachmentId = attachmentMatch[1];
    return allowedAttachmentIds.has(attachmentId)
      ? { kind: "attachment", attachmentId, src }
      : { kind: "blocked" };
  }

  const parsed = parseHttpUrl(src, false);
  return parsed
    ? { kind: "external", href: parsed.url.href, originLabel: parsed.url.origin }
    : { kind: "blocked" };
}

export function safeMarkdownLinkHref(href: string | undefined) {
  if (!href) return null;
  const parsed = parseHttpUrl(href, true);
  if (!parsed) return null;
  if (!parsed.parsedAsRelative) return parsed.url.href;
  if (href.startsWith("#")) return parsed.url.hash;
  return `${parsed.url.pathname}${parsed.url.search}${parsed.url.hash}`;
}

export function externalOriginLabel(href: string) {
  const parsed = parseHttpUrl(href, false);
  return parsed?.url.origin ?? "External media";
}
