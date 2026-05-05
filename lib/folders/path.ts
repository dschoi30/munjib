export function normalizeFolderPath(path: string) {
  const segments = path
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function buildChildPath(parentPath: string | null | undefined, childSlug: string) {
  const parent = normalizeFolderPath(parentPath ?? "/");
  const slug = childSlug.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  return parent === "/" ? `/${slug}` : `${parent}/${slug}`;
}

export function pathToWikiTarget(path: string) {
  const normalized = normalizeFolderPath(path);
  if (normalized === "/") return "";
  return normalized
    .slice(1)
    .split("/")
    .map((segment) =>
      segment
        .split("-")
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" "),
    )
    .join("/");
}
