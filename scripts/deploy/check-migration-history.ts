import { readMigrationFiles, readMigrationLedger } from "../../lib/deploy/migration-history";

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

const allocations = (ledger as typeof ledger & { allocations?: Array<{ migrationName: string }> }).allocations ?? [];
const names = [...migrations.map((migration) => migration.migrationName), ...allocations.map((allocation) => allocation.migrationName)];
if (new Set(names).size !== names.length || names.some((name, index) => index > 0 && names[index - 1]! >= name)) {
  throw new Error("migration allocation is not append-only and strictly monotonic");
}
console.log(`MIGRATION_HISTORY_OK migrations=${migrations.length} allocations=${allocations.length}`);
