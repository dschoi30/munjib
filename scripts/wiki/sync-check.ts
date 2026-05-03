import { checkWikiSync, renderWikiSyncPlan, WikiSyncRequiredError, type WikiSyncMode } from "@/lib/wiki/sync";

async function main() {
  const { mode, since } = parseArgs(process.argv.slice(2));
  const plan = await checkWikiSync({ mode, since });
  process.stdout.write(renderWikiSyncPlan(plan));
}

function parseArgs(args: string[]): { mode: WikiSyncMode; since?: string } {
  if (args.includes("--staged")) return { mode: "staged" };
  const sinceIndex = args.indexOf("--since");
  if (sinceIndex !== -1) {
    return { mode: "since", since: args[sinceIndex + 1] ?? "HEAD~1" };
  }
  return { mode: "working-tree" };
}

main().catch((error) => {
  if (error instanceof WikiSyncRequiredError) {
    process.stderr.write(renderWikiSyncPlan(error.plan));
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
