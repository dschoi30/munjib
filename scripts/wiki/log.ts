import { readRecentWikiLogEntries } from "@/lib/wiki/log";

async function main() {
  const count = Number.parseInt(process.argv[2] ?? "10", 10);
  const entries = await readRecentWikiLogEntries(process.cwd(), Number.isFinite(count) ? count : 10);
  console.log(entries.join("\n\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
