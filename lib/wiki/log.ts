import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readRecentWikiLogEntries(rootDir = process.cwd(), count = 10): Promise<string[]> {
  const log = await readFile(path.join(rootDir, "wiki", "log.md"), "utf8");
  return log
    .split(/\n(?=## \d{4}-\d{2}-\d{2}T)/)
    .filter((entry) => entry.startsWith("## "))
    .map((entry) => entry.trim())
    .reverse()
    .slice(0, count);
}
