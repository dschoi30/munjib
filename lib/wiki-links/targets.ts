import { slugifyTitle } from "@/lib/text/slug";

export function pathQualifiedTargetToDocumentPath(targetTitleRaw: string) {
  const segments = targetTitleRaw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => slugifyTitle(segment))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

export function pathQualifiedTargetToLookupKey(targetTitleRaw: string) {
  return pathQualifiedTargetToDocumentPath(targetTitleRaw).replace(/^\/+/, "");
}

export function pathQualifiedTargetToCreateInput(targetTitleRaw: string) {
  const segments = targetTitleRaw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) return null;

  return {
    folderPath: `/${segments.slice(0, -1).map((segment) => slugifyTitle(segment)).join("/")}`,
    title: segments[segments.length - 1] ?? "",
  };
}
