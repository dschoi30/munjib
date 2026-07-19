import {
  failClosedPurgePhysicalExecutor,
  failClosedPurgeReadiness,
} from "@/lib/retention/purge-readiness";

export const leaf14ProductionReadinessSlotVersion = 0 as const;
export const productionPurgeReadiness = failClosedPurgeReadiness;
export const productionPurgePhysicalExecutor = failClosedPurgePhysicalExecutor;
