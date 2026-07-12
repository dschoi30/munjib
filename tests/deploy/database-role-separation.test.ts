import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("database authority separation", () => {
  it("bootstraps a NOLOGIN owner, a restricted migrator, and least-privilege app roles", () => {
    const sql = read("deploy/postgres/roles-only.sql");
    expect(sql).toContain("munjib_schema_owner");
    expect(sql).toMatch(/CREATE ROLE\s+munjib_schema_owner[\s\S]*NOLOGIN/i);
    expect(sql).toMatch(/CREATE ROLE\s+munjib_migrator[\s\S]*LOGIN/i);
    expect(sql).toContain("NOINHERIT");
    expect(sql).toContain("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    expect(sql).toContain("GRANT munjib_schema_owner TO munjib_migrator");
    expect(sql).toContain("SET ROLE munjib_schema_owner");
    expect(sql).toContain("pg_catalog,public,munjib_extensions");
    expect(sql).toContain("ALTER SCHEMA public OWNER TO munjib_schema_owner");
    expect(sql).toContain("ALTER SCHEMA munjib_extensions OWNER TO munjib_schema_owner");
    expect(sql).toContain("GRANT USAGE, CREATE ON SCHEMA public TO munjib_schema_owner");
    expect(sql).toMatch(/ALTER ROLE\s+munjib_migrator\s+LOGIN[\s\S]*NOINHERIT[\s\S]*NOBYPASSRLS/i);
    expect(sql).toMatch(/ALTER ROLE\s+munjib_web\s+LOGIN[\s\S]*NOINHERIT[\s\S]*NOBYPASSRLS/i);
    expect(sql).toMatch(/ALTER ROLE\s+munjib_journal_owner\s+NOLOGIN[\s\S]*NOBYPASSRLS/i);
  });

  it("keeps web and RAG away from DDL, ownership, truncation, and journal authority", () => {
    const sql = read("deploy/postgres/finalize-ownership.sql");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public FROM munjib_web");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public FROM munjib_rag");
    expect(sql).toMatch(/REVOKE[\s\S]*TRUNCATE[\s\S]*FROM\s+munjib_web/i);
    expect(sql).toMatch(/REVOKE[\s\S]*munjib_schema_owner[\s\S]*FROM\s+munjib_web/i);
    expect(sql).toMatch(/REVOKE[\s\S]*munjib_schema_owner[\s\S]*FROM\s+munjib_rag/i);
    expect(sql).toMatch(/REVOKE[\s\S]*ON TABLE\s+"?_prisma_migrations"?[\s\S]*FROM\s+munjib_web/i);
    expect(sql).toMatch(/REVOKE[\s\S]*ON TABLE\s+"?_prisma_migrations"?[\s\S]*FROM\s+munjib_web,\s+munjib_rag/i);
    expect(sql).not.toMatch(/CREATE EXTENSION\s+pgcrypto/i);
    expect(sql).not.toMatch(/security_journal|genesis/i);
  });

  it("verifies pg_catalog first and rejects caller-provided libpq authority", () => {
    const sql = read("deploy/postgres/verify-role-separation.sql");
    expect(sql).toContain("SET search_path = pg_catalog, public, munjib_extensions");
    expect(sql).toContain("RESET ROLE");
    expect(sql).toContain("RESET SESSION AUTHORIZATION");
    expect(sql).toContain("caller_requested_role");
    expect(sql).toContain("current_setting('role'");
    expect(sql).toContain("current_setting('search_path'");
    expect(sql).toContain("pg_catalog");
    expect(sql).toMatch(/public[\s\S]*shadow|shadow[\s\S]*public/i);
  });

  it("clears caller libpq variables before fixed credential files at each entrypoint", () => {
    const migrator = read("docker-compose.migrator.yml");
    const tools = read("docker-compose.tools.yml");
    for (const source of [migrator, tools]) {
      expect(source).toContain("unset PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE PGSERVICE PGSERVICEFILE");
      expect(source).toContain("PGPASSFILE=/run/secrets/");
      expect(source).toContain("search_path=pg_catalog,public,munjib_extensions");
    }
    expect(migrator).toContain("role=munjib_schema_owner");
    expect(tools).not.toContain("role=munjib_schema_owner");
  });

  it("does not embed credentials or create journal/genesis objects in the pre-journal bundle", () => {
    for (const file of ["deploy/postgres/roles-only.sql", "deploy/postgres/finalize-ownership.sql", "deploy/postgres/verify-role-separation.sql"]) {
      const source = read(file);
      expect(source).not.toMatch(/password\s*['\"]|secret|BEGIN PRIVATE KEY|postgresql:\/\//i);
      expect(source).not.toMatch(/CREATE\s+(EXTENSION\s+pgcrypto|TABLE\s+.*journal|TABLE\s+.*genesis)/i);
    }
  });
});
