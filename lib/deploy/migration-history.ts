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

/** Prisma stores the SHA-256 of the exact migration.sql bytes. */
export function computeMigrationChecksum(sql: string | Uint8Array): string {
  return createHash("sha256").update(sql).digest("hex");
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
}

export function readMigrationLedger(path: string): MigrationLedger {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as MigrationLedger;
  if (parsed.format !== "munjib-migration-ledger-v1" || parsed.version !== 1 || !Array.isArray(parsed.migrations)) {
    throw new Error("invalid migration ledger");
  }
  return parsed;
}
