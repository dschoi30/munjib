export function resolveAppLocalRedirectPath(url: string, origin: string) {
  try {
    const parsed = new URL(url, origin);
    if (parsed.origin !== origin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function resolveAuthClientRedirectPath(
  resultUrl: string | null | undefined,
  fallbackUrl: string,
  origin: string,
) {
  return (
    (resultUrl ? resolveAppLocalRedirectPath(resultUrl, origin) : null) ??
    resolveAppLocalRedirectPath(fallbackUrl, origin)
  );
}
