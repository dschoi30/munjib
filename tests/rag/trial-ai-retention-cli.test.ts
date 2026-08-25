import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rag/trial-ai-retention", () => ({
  purgeExpiredTrialAiData: vi.fn(),
}));

import { purgeExpiredTrialAiData } from "@/lib/rag/trial-ai-retention";
import {
  parseTrialAiRetentionArgs,
  runTrialAiRetentionCli,
} from "@/lib/rag/trial-ai-retention-cli";

describe("parseTrialAiRetentionArgs", () => {
  it("defaults to a non-mutating dry run", () => {
    expect(parseTrialAiRetentionArgs([])).toEqual({ execute: false });
  });

  it("requires the explicit execute flag for deletion", () => {
    expect(parseTrialAiRetentionArgs(["--execute"])).toEqual({ execute: true });
    expect(() => parseTrialAiRetentionArgs(["--dry-run"])).toThrow("Unknown argument");
    expect(() => parseTrialAiRetentionArgs(["--execute", "--execute"])).toThrow(
      "--execute may be specified only once",
    );
  });
});

describe("runTrialAiRetentionCli", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prints database cutoffs and per-table candidate/deletion counts", async () => {
    vi.mocked(purgeExpiredTrialAiData).mockResolvedValue({
      dryRun: true,
      databaseNow: "2026-08-25T12:34:56.000Z",
      databaseKstDate: "2026-08-25",
      cutoffs: {
        visitorBeforeKstDate: "2026-07-22",
        sharedBeforeKstDate: "2026-08-18",
        leaseExpiresBefore: "2026-08-24T12:34:56.000Z",
      },
      candidates: { visitorDaily: 4, networkDaily: 3, globalDaily: 2, admissionLease: 1 },
      deleted: { visitorDaily: 0, networkDaily: 0, globalDaily: 0, admissionLease: 0 },
    });
    const log = vi.fn();

    await runTrialAiRetentionCli([], log);

    expect(purgeExpiredTrialAiData).toHaveBeenCalledWith({ execute: false });
    expect(log).toHaveBeenCalledWith(
      "dry run: candidates visitor=4 network=3 global=2 leases=1; deleted visitor=0 network=0 global=0 leases=0",
    );
  });
});
