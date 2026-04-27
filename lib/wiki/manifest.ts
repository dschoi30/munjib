import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listWikiMarkdownFiles, readWorkspaceFile } from "./files";
import { parseWikiMarkdown } from "./frontmatter";
import type { WikiManifest, WikiManifestPage } from "./types";

export async function buildWikiManifest(rootDir = process.cwd(), updated = today()): Promise<WikiManifest> {
  const pages = await Promise.all(
    (await listWikiMarkdownFiles(rootDir)).map(async (relativePath): Promise<WikiManifestPage> => {
      const markdown = await readWorkspaceFile(rootDir, relativePath);
      const { frontmatter } = parseWikiMarkdown(markdown, relativePath);
      return {
        id: frontmatter.id,
        path: relativePath,
        title: frontmatter.title,
        type: frontmatter.type,
        status: frontmatter.status,
        summary: frontmatter.summary,
        tags: frontmatter.tags,
        links: frontmatter.links,
        source_count: frontmatter.source_count,
        searchPriority: searchPriorityFor(relativePath, frontmatter.type),
      };
    }),
  );

  return { version: 1, updated, pages: pages.sort((a, b) => a.path.localeCompare(b.path)) };
}

export async function writeWikiManifest(rootDir: string, manifest: WikiManifest): Promise<void> {
  await mkdir(path.join(rootDir, "wiki"), { recursive: true });
  await writeFile(path.join(rootDir, "wiki", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function searchPriorityFor(relativePath: string, type: string): number {
  if (relativePath === "wiki/index.md") return 5;
  if (relativePath === "wiki/log.md") return 1;
  if (type === "concept" || type === "workflow") return 50;
  if (type === "decision") return 40;
  return 30;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
