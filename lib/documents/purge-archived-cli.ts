import {
  purgeExpiredArchivedDocuments,
  type PurgeExpiredArchivedDocumentsResult,
} from "@/lib/documents/purge-archived";

export type PurgeArchivedDocumentsCliOptions = {
  dryRun: boolean;
  workspaceSlug?: string;
};

export function parsePurgeArchivedDocumentsArgs(
  args: string[],
): PurgeArchivedDocumentsCliOptions {
  const options: PurgeArchivedDocumentsCliOptions = { dryRun: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--" && index === 0) {
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--workspace") {
      const workspaceSlug = args[index + 1]?.trim();
      if (!workspaceSlug || workspaceSlug.startsWith("-")) {
        throw new Error("--workspace requires a workspace slug");
      }

      options.workspaceSlug = workspaceSlug;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runPurgeArchivedDocumentsCli(
  args = process.argv.slice(2),
  log = console.log,
): Promise<PurgeExpiredArchivedDocumentsResult> {
  const options = parsePurgeArchivedDocumentsArgs(args);
  const result = await purgeExpiredArchivedDocuments({
    dryRun: options.dryRun,
    workspaceSlug: options.workspaceSlug,
  });
  const prefix = result.dryRun ? "dry run: " : "";

  for (const workspace of result.workspaces) {
    log(
      `${prefix}workspace ${workspace.workspaceSlug}: ${workspace.count} expired archived documents`,
    );
  }

  log(`${prefix}total expired archived documents: ${result.totalCount}`);

  return result;
}
