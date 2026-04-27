import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function listWikiMarkdownFiles(rootDir: string): Promise<string[]> {
  const wikiRoot = path.join(rootDir, "wiki");
  const files = await walk(wikiRoot);
  return files
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.relative(rootDir, file).split(path.sep).join("/"))
    .sort();
}

export async function readWorkspaceFile(rootDir: string, relativePath: string): Promise<string> {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
    }),
  );
  return files.flat();
}
