import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WikiManifest, WikiManifestPage } from "./types";

export type WikiSearchResult = Pick<WikiManifestPage, "path" | "title" | "type" | "status" | "summary"> & {
  score: number;
};

export async function searchWiki(query: string, rootDir = process.cwd()): Promise<WikiSearchResult[]> {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const [indexText, manifest] = await Promise.all([
    readOptional(path.join(rootDir, "wiki", "index.md")),
    readManifest(rootDir),
  ]);

  return manifest.pages
    .map((page) => ({ page, score: scorePage(page, indexText, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path))
    .map(({ page, score }) => ({
      path: page.path,
      title: page.title,
      type: page.type,
      status: page.status,
      summary: page.summary,
      score,
    }));
}

async function readManifest(rootDir: string): Promise<WikiManifest> {
  const raw = await readFile(path.join(rootDir, "wiki", "manifest.json"), "utf8");
  return JSON.parse(raw) as WikiManifest;
}

async function readOptional(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function scorePage(page: WikiManifestPage, indexText: string, normalizedQuery: string): number {
  const haystacks = [
    page.title,
    page.path,
    page.summary,
    page.type,
    page.status,
    ...page.tags,
    indexText.includes(page.title) ? page.title : "",
  ].map(normalize);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;
  const matches = tokens.filter((token) => haystacks.some((haystack) => haystack.includes(token))).length;
  return matches === tokens.length ? matches * 10 + page.searchPriority : 0;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim();
}
