import { readFileSync } from "node:fs";
import { readMigrationFiles, readMigrationLedger, validateMigrationHistory, type MigrationHistoryRow } from "../../lib/deploy/migration-history";

const root = process.cwd();
const migrations = readMigrationFiles(`${root}/prisma/migrations`);
const ledger = readMigrationLedger(`${root}/deploy/security/migration-ledger.json`);

if (ledger.migrations.length !== migrations.length) {
  throw new Error(`migration ledger length mismatch: ${ledger.migrations.length} != ${migrations.length}`);
}
for (const [index, entry] of ledger.migrations.entries()) {
  const migration = migrations[index];
  if (!migration || migration.migrationName !== entry.migrationName || migration.checksum !== entry.checksum) {
    throw new Error(`migration ledger mismatch at ${entry.migrationName}`);
  }
}

const allocations = ledger.allocations ?? [];
const names = [...migrations.map((migration) => migration.migrationName), ...allocations.map((allocation) => allocation.migrationName)];
if (new Set(names).size !== names.length || names.some((name, index) => index > 0 && names[index - 1]! >= name)) {
  throw new Error("migration allocation is not append-only and strictly monotonic");
}

const productionHistoryPath = process.argv[2];
if (productionHistoryPath) {
  const parsed = JSON.parse(readFileSync(productionHistoryPath, "utf8")) as MigrationHistoryRow[] | { rows: MigrationHistoryRow[] };
  const productionRows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(productionRows)) throw new Error("production history JSON must be an array or {rows: []}");
  const imageRows: MigrationHistoryRow[] = migrations.map((migration) => ({
    migrationName: migration.migrationName,
    checksum: migration.checksum,
    finishedAt: "image",
    rolledBackAt: null,
    appliedStepsCount: 1,
    logs: null,
  }));
  const admission = validateMigrationHistory(productionRows, imageRows);
  if (!admission.ok) throw new Error(admission.reason ?? "migration history rejected");
  console.log(`MIGRATION_HISTORY_OK migrations=${migrations.length} allocations=${allocations.length} applied=${admission.appliedCount} pending=${admission.pending.length}`);
} else {
  console.log(`MIGRATION_HISTORY_LEDGER_OK migrations=${migrations.length} allocations=${allocations.length} production_prefix=not_provided`);
}
