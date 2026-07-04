import { readFile } from "node:fs/promises";
import path from "node:path";

function logEntryTimestamp(entry: string) {
  const match = entry.match(/^##\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:?\d{2}|Z))/);
  if (!match) {
    return 0;
  }

  const normalized = match[1].replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const timestamp = Date.parse(normalized);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export async function readRecentWikiLogEntries(rootDir = process.cwd(), count = 10): Promise<string[]> {
  const log = await readFile(path.join(rootDir, "wiki", "log.md"), "utf8");
  return log
    .split(/\n(?=## \d{4}-\d{2}-\d{2}T)/)
    .filter((entry) => entry.startsWith("## "))
    .map((entry) => entry.trim())
    .sort((left, right) => logEntryTimestamp(right) - logEntryTimestamp(left))
    .slice(0, count);
}
