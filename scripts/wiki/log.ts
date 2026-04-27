import { readRecentWikiLogEntries } from "@/lib/wiki/log";

const count = Number.parseInt(process.argv[2] ?? "10", 10);
const entries = await readRecentWikiLogEntries(process.cwd(), Number.isFinite(count) ? count : 10);
console.log(entries.join("\n\n"));
