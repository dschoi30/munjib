import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface MigrationHistoryRow {
  migrationName: string;
  checksum: string;
  finishedAt: string | null;
  rolledBackAt: string | null;
  appliedStepsCount: number;
  logs?: string | null;
}

export interface MigrationHistoryResult {
  ok: boolean;
  appliedCount: number;
  reason?: string;
  pending: string[];
}

/** Normalize a Prisma `_prisma_migrations` export without accepting partial rows. */
export function normalizeMigrationHistoryRow(input: unknown): MigrationHistoryRow {
  if (!input || typeof input !== "object") throw new Error("invalid migration history row");
  const value = input as Record<string, unknown>;
  const migrationName = value.migrationName ?? value.migration_name;
  const checksum = value.checksum;
  const finishedAt = value.finishedAt ?? value.finished_at;
  const rolledBackAt = value.rolledBackAt ?? value.rolled_back_at;
  const appliedStepsCount = value.appliedStepsCount ?? value.applied_steps_count;
  if (typeof migrationName !== "string" || typeof checksum !== "string") throw new Error("migration history name/checksum missing");
  if (!(typeof finishedAt === "string" || finishedAt === null)) throw new Error("migration history finished_at missing");
  if (!(typeof rolledBackAt === "string" || rolledBackAt === null)) throw new Error("migration history rolled_back_at missing");
  if (typeof appliedStepsCount !== "number" || !Number.isInteger(appliedStepsCount) || appliedStepsCount < 0) {
    throw new Error("migration history applied_steps_count missing");
  }
  const logs = value.logs;
  if (!(logs === undefined || logs === null || typeof logs === "string")) throw new Error("migration history logs invalid");
  return { migrationName, checksum, finishedAt, rolledBackAt, appliedStepsCount, logs: logs ?? null };
}

/** Prisma stores the SHA-256 of the exact migration.sql bytes. */
export function computeMigrationChecksum(sql: string | Uint8Array): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function sortMigrationHistoryRows(rows: MigrationHistoryRow[]): MigrationHistoryRow[] {
  return [...rows].sort((left, right) =>
    left.migrationName < right.migrationName ? -1 : left.migrationName > right.migrationName ? 1 : 0,
  );
}

function isSuccessful(row: MigrationHistoryRow): boolean {
  return Boolean(row.finishedAt) && !row.rolledBackAt && row.appliedStepsCount > 0;
}

function hasStrictNames(rows: MigrationHistoryRow[]): boolean {
  return rows.every((row, index) => index === 0 || rows[index - 1]!.migrationName < row.migrationName);
}

/**
 * Admit an image only when production's successful history is a byte-for-byte
 * prefix of the image history. Failed/rolled-back rows are evidence of an
 * unresolved migration and must be repaired before a release is admitted.
 */
export function validateMigrationHistory(
  productionRows: MigrationHistoryRow[],
  imageRows: MigrationHistoryRow[],
): MigrationHistoryResult {
  if (!hasStrictNames(imageRows)) {
    return { ok: false, appliedCount: 0, pending: [], reason: "image migration names are not strictly monotonic" };
  }
  if (!hasStrictNames(productionRows)) {
    return { ok: false, appliedCount: 0, pending: [], reason: "production migration names are not strictly monotonic" };
  }
  const unresolved = productionRows.find((row) => !isSuccessful(row));
  if (unresolved) {
    return { ok: false, appliedCount: 0, pending: [], reason: `unresolved migration: ${unresolved.migrationName}` };
  }
  if (productionRows.length > imageRows.length) {
    return { ok: false, appliedCount: 0, pending: [], reason: "production history is longer than image history" };
  }
  for (const [index, production] of productionRows.entries()) {
    const image = imageRows[index];
    if (!image || production.migrationName !== image.migrationName || production.checksum !== image.checksum) {
      return { ok: false, appliedCount: 0, pending: [], reason: `migration prefix mismatch at ${production.migrationName}` };
    }
  }
  return {
    ok: true,
    appliedCount: productionRows.length,
    pending: imageRows.slice(productionRows.length).map((row) => row.migrationName),
  };
}

export interface MigrationFile {
  migrationName: string;
  checksum: string;
  sqlPath: string;
}

/** Read and checksum Prisma migration directories in canonical name order. */
export function readMigrationFiles(migrationsRoot: string): MigrationFile[] {
  return readdirSync(migrationsRoot)
    .filter((entry) => statSync(join(migrationsRoot, entry)).isDirectory())
    .sort()
    .map((migrationName) => {
      const sqlPath = join(migrationsRoot, migrationName, "migration.sql");
      const bytes = readFileSync(sqlPath);
      return { migrationName, checksum: computeMigrationChecksum(bytes), sqlPath };
    });
}

export interface MigrationLedgerEntry {
  leaf: number | string;
  migrationName: string;
  checksum?: string;
}

export interface MigrationLedger {
  format: "munjib-migration-ledger-v1";
  version: 1;
  migrations: MigrationLedgerEntry[];
  allocations?: MigrationLedgerEntry[];
}

export function readMigrationLedger(path: string): MigrationLedger {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as MigrationLedger;
  if (parsed.format !== "munjib-migration-ledger-v1" || parsed.version !== 1 || !Array.isArray(parsed.migrations)) {
    throw new Error("invalid migration ledger");
  }
  const entries = [...parsed.migrations, ...(parsed.allocations ?? [])];
  if (entries.some((entry) => !entry.migrationName || (entry.checksum !== undefined && !/^[a-f0-9]{64}$/.test(entry.checksum)))) {
    throw new Error("invalid migration ledger entry");
  }
  if (entries.some((entry, index) => index > 0 && entries[index - 1]!.migrationName >= entry.migrationName)) {
    throw new Error("migration ledger is not strictly monotonic");
  }
  return parsed;
}
