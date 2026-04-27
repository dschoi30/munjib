import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { listWikiMarkdownFiles, readWorkspaceFile } from "./files";
import { parseWikiMarkdown } from "./frontmatter";
import type { WikiManifest } from "./types";

export type WikiLintResult = {
  errors: string[];
  warnings: string[];
};

export async function lintWiki(rootDir = process.cwd()): Promise<WikiLintResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files = await listWikiMarkdownFiles(rootDir);
  const titleByFile = new Map<string, string>();

  for (const file of files) {
    try {
      const parsed = parseWikiMarkdown(await readWorkspaceFile(rootDir, file), file);
      titleByFile.set(file, parsed.frontmatter.title);
      if (parsed.frontmatter.status === "stale") {
        warnings.push(`${file}: status is stale`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${file}: unknown parse error`);
    }
  }

  const manifest = await readManifest(rootDir, errors);
  if (manifest) {
    await validateManifestFiles(rootDir, manifest, errors);
    validateDuplicateIds(manifest, errors);
    await validateIndexCoverage(rootDir, manifest, warnings);
  }

  await validateWikiLinks(rootDir, files, titleByFile, warnings);

  return { errors, warnings };
}

async function readManifest(rootDir: string, errors: string[]): Promise<WikiManifest | undefined> {
  try {
    return JSON.parse(await readFile(path.join(rootDir, "wiki", "manifest.json"), "utf8")) as WikiManifest;
  } catch {
    errors.push("wiki/manifest.json: missing or invalid manifest");
    return undefined;
  }
}

async function validateManifestFiles(rootDir: string, manifest: WikiManifest, errors: string[]) {
  for (const page of manifest.pages) {
    try {
      await access(path.join(rootDir, page.path));
    } catch {
      errors.push(`wiki/manifest.json: missing file ${page.path}`);
    }
  }
}

function validateDuplicateIds(manifest: WikiManifest, errors: string[]) {
  const seen = new Set<string>();
  for (const page of manifest.pages) {
    if (seen.has(page.id)) {
      errors.push(`wiki/manifest.json: duplicate id ${page.id}`);
    }
    seen.add(page.id);
  }
}

async function validateIndexCoverage(rootDir: string, manifest: WikiManifest, warnings: string[]) {
  const index = await readFile(path.join(rootDir, "wiki", "index.md"), "utf8").catch(() => "");
  for (const page of manifest.pages) {
    if (page.path === "wiki/index.md" || page.path === "wiki/log.md") continue;
    if (!index.includes(page.title) && !index.includes(page.path)) {
      warnings.push(`${page.path}: missing from wiki/index.md`);
    }
  }
}

async function validateWikiLinks(rootDir: string, files: string[], titleByFile: Map<string, string>, warnings: string[]) {
  const knownTitles = new Set([...titleByFile.values()]);
  for (const file of files) {
    const markdown = stripFencedCodeBlocks(await readWorkspaceFile(rootDir, file).catch(() => ""));
    for (const match of markdown.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const target = (match[1] ?? "").split("|")[0]?.trim() ?? "";
      if (target && !knownTitles.has(target)) {
        warnings.push(`${file}: unresolved wiki link [[${target}]]`);
      }
    }
  }
}

function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]+`/g, "");
}
