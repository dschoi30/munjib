import {
  purgeExpiredTrialAiData,
  type PurgeExpiredTrialAiDataResult,
} from "@/lib/rag/trial-ai-retention";

export function parseTrialAiRetentionArgs(args: string[]): { execute: boolean } {
  let execute = false;
  for (const [index, arg] of args.entries()) {
    if (arg === "--" && index === 0) continue;
    if (arg === "--execute") {
      if (execute) throw new Error("--execute may be specified only once");
      execute = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { execute };
}

export async function runTrialAiRetentionCli(
  args = process.argv.slice(2),
  log = console.log,
): Promise<PurgeExpiredTrialAiDataResult> {
  const options = parseTrialAiRetentionArgs(args);
  const result = await purgeExpiredTrialAiData(options);
  const prefix = result.dryRun ? "dry run: " : "execute: ";

  log(
    `${prefix}database now=${result.databaseNow} kst-date=${result.databaseKstDate}; ` +
      `visitor-before=${result.cutoffs.visitorBeforeKstDate} ` +
      `shared-before=${result.cutoffs.sharedBeforeKstDate} ` +
      `lease-expires-before=${result.cutoffs.leaseExpiresBefore}`,
  );
  log(
    `${prefix}candidates visitor=${result.candidates.visitorDaily} ` +
      `network=${result.candidates.networkDaily} global=${result.candidates.globalDaily} ` +
      `leases=${result.candidates.admissionLease}; deleted visitor=${result.deleted.visitorDaily} ` +
      `network=${result.deleted.networkDaily} global=${result.deleted.globalDaily} ` +
      `leases=${result.deleted.admissionLease}`,
  );
  return result;
}
