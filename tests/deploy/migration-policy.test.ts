import { describe, expect, it } from "vitest";
import { classifyMigration, validateMigrationSql } from "@/lib/deploy/migration-policy";

describe("expand/contract migration policy", () => {
  it("accepts additive expand SQL and rejects destructive SQL in the expand phase", () => {
    expect(classifyMigration("CREATE TABLE \"NewThing\" (\"id\" text NOT NULL);"))
      .toBe("EXPAND");
    expect(classifyMigration("ALTER TABLE \"NewThing\" ADD COLUMN \"name\" text;"))
      .toBe("EXPAND");
    expect(validateMigrationSql("DROP TABLE \"NewThing\";", "EXPAND").ok).toBe(false);
    expect(validateMigrationSql("ALTER TABLE \"NewThing\" DROP COLUMN \"name\";", "EXPAND").ok).toBe(false);
    expect(validateMigrationSql("TRUNCATE \"NewThing\";", "EXPAND").ok).toBe(false);
  });

  it("requires contract statements to be explicitly classified and still blocks unsafe verbs", () => {
    expect(classifyMigration("-- phase: contract\nALTER TABLE \"NewThing\" DROP COLUMN \"old\";"))
      .toBe("CONTRACT");
    expect(validateMigrationSql("-- phase: contract\nALTER TABLE \"NewThing\" DROP COLUMN \"old\";", "CONTRACT").ok).toBe(true);
    expect(validateMigrationSql("-- phase: contract\nDROP DATABASE obsidian_clone;", "CONTRACT").ok).toBe(false);
    expect(classifyMigration("ALTER TABLE \"NewThing\" DROP COLUMN \"old\";")).toBe("INVALID");
    expect(validateMigrationSql("ALTER TABLE \"NewThing\" DROP COLUMN \"old\";", "CONTRACT").ok).toBe(false);
  });

  it("rejects ambiguous or data-destructive migrations", () => {
    expect(validateMigrationSql("ALTER TABLE \"NewThing\" ALTER COLUMN \"name\" TYPE integer;", "EXPAND").ok).toBe(false);
    expect(validateMigrationSql("DELETE FROM \"NewThing\";", "CONTRACT").ok).toBe(false);
    expect(validateMigrationSql("-- phase: expand\nALTER TABLE \"NewThing\" DROP COLUMN \"old\";", "EXPAND").ok).toBe(false);
    expect(classifyMigration("ALTER TABLE a ADD COLUMN x text; DROP TABLE b;")).toBe("INVALID");
    expect(classifyMigration("ALTER TABLE a ADD COLUMN x text; ALTER TABLE a DROP COLUMN x;")).toBe("INVALID");
  });
});
