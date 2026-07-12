import { readFileSync } from "node:fs";
import { validateMigrationSql, type MigrationPhase } from "../../lib/deploy/migration-policy";

const path = process.argv[2];
const phase = process.argv[3] as MigrationPhase | undefined;
if (!path || (phase !== "EXPAND" && phase !== "CONTRACT")) {
  throw new Error("usage: pnpm exec tsx scripts/deploy/check-expand-contract.ts <migration.sql> <EXPAND|CONTRACT>");
}
const result = validateMigrationSql(readFileSync(path, "utf8"), phase);
if (!result.ok) throw new Error(result.reason ?? "migration policy rejected");
console.log(`MIGRATION_POLICY_OK phase=${phase}`);
