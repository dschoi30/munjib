import { describe, expect, it } from "vitest";
import {
  computeMigrationChecksum,
  validateMigrationHistory,
  type MigrationHistoryRow,
} from "@/lib/deploy/migration-history";

const row = (migrationName: string, checksum: string, overrides: Partial<MigrationHistoryRow> = {}): MigrationHistoryRow => ({
  migrationName,
  checksum,
  finishedAt: "2026-07-13T00:00:00.000Z",
  rolledBackAt: null,
  appliedStepsCount: 1,
  logs: null,
  ...overrides,
});

describe("append-only production migration history", () => {
  it("accepts a clean database and a latest snapshot", () => {
    const image = [row("20260712000000_first", "a"), row("20260712010000_second", "b")];
    expect(validateMigrationHistory([], image)).toMatchObject({ ok: true, appliedCount: 0 });
    expect(validateMigrationHistory(image, image)).toMatchObject({ ok: true, appliedCount: 2 });
  });

  it("requires successful production rows to be an exact name/checksum prefix", () => {
    const image = [row("20260712000000_first", "a"), row("20260712010000_second", "b")];
    expect(validateMigrationHistory([row("20260712000000_first", "edited")], image).ok).toBe(false);
    expect(validateMigrationHistory([row("20260712010000_other", "a")], image).ok).toBe(false);
    expect(validateMigrationHistory([row("20260712010000_second", "b")], image).ok).toBe(false);
  });

  it("rejects failed or unresolved rows instead of silently skipping them", () => {
    const image = [row("20260712000000_first", "a")];
    expect(validateMigrationHistory([row("20260712000000_first", "a", { finishedAt: null })], image).ok).toBe(false);
    expect(validateMigrationHistory([row("20260712000000_first", "a", { rolledBackAt: "2026-07-13T01:00:00.000Z" })], image).ok).toBe(false);
    expect(validateMigrationHistory([row("20260712000000_first", "a", { appliedStepsCount: 0 })], image).ok).toBe(false);
    expect(validateMigrationHistory([
      { migrationName: "20260712000000_first", checksum: "a" } as MigrationHistoryRow,
    ], image).ok).toBe(false);
  });

  it("rejects edited image history and nonmonotonic pending names", () => {
    const production = [row("20260712000000_first", "a")];
    expect(validateMigrationHistory(production, [
      row("20260712000000_first", "a"),
      row("20260712010000_second", "b"),
      row("20260712010000_second", "changed"),
    ]).ok).toBe(false);
    expect(validateMigrationHistory(production, [
      row("20260712000000_first", "a"),
      row("20260712020000_later", "c"),
      row("20260712010000_earlier", "b"),
    ]).ok).toBe(false);
  });

  it("uses the canonical SHA-256 checksum for migration SQL", () => {
    expect(computeMigrationChecksum("CREATE TABLE example (id text);\n")).toBe(
      "0f2ff3eb179f68a046851c493a4dfee182ea8d8ffdc092715d830a261a341056",
    );
  });

  it("admits a broker-provided production export through the same prefix validator", () => {
    const image = [row("20260712000000_first", "a"), row("20260712010000_second", "b")];
    expect(validateMigrationHistory([image[0]!], image)).toMatchObject({ ok: true, pending: ["20260712010000_second"] });
  });
});
