import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("immutable private runtime image contract", () => {
  test("pins the native ARM64 base image and avoids a broad build-context copy", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain(
      "FROM node:22-alpine@sha256:d51cff3fa44ab8a368ae8708ae974480165be1b699b19527b7c0d2523433b271 AS base",
    );
    expect(dockerfile).not.toMatch(/^COPY\s+\.\s+\.$/m);
    expect(dockerfile).not.toMatch(/COPY\s+\.\s+\.\//);
    expect(dockerfile).toContain("USER 10001:10001");
  });

  test("production compose uses digest-only private, read-only, capability-dropped services", () => {
    const compose = read("docker-compose.yml");
    const config = parse(compose) as { services: Record<string, any> };

    expect(compose).toContain("image: ${WEB_IMAGE:?exact application digest required}");
    expect(compose).toContain("image: ${POSTGRES_IMAGE:?exact postgres digest required}");
    expect(compose).not.toContain("build:");
    expect(compose).not.toMatch(/ports:\s*\n\s*-\s*[\"']?5432/);
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain("- ALL");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("tmpfs:");
    expect(compose).toContain("127.0.0.1:${WEB_PORT:-3000}:3000");
    for (const secret of config.services.web.secrets) {
      expect(secret).toMatchObject({ uid: "10001", gid: "10001", mode: "0400" });
    }
  });

  test("candidate overlay disables side effects and does not publish a live port", () => {
    const candidate = read("docker-compose.candidate.yml");

    expect(candidate).toContain("MUNJIB_CANDIDATE: \"true\"");
    for (const key of [
      "MUNJIB_DISABLE_EMAIL",
      "MUNJIB_DISABLE_OAUTH_CALLBACKS",
      "MUNJIB_DISABLE_BACKGROUND_JOBS",
      "MUNJIB_DISABLE_INDEXING",
      "MUNJIB_DISABLE_EXTERNAL_PROVIDERS",
    ]) {
      expect(candidate).toContain(`${key}: \"true\"`);
    }
    expect(candidate).toContain('MUNJIB_ATTACHMENTS_WRITABLE: "false"');
    expect(candidate).toContain("ports: []");
    expect(candidate).toContain("read_only: true");
    expect(candidate).toContain("cap_drop:");
  });

  test("migrator and tools overlays keep exact role health and bootstrap credentials", () => {
    for (const path of ["docker-compose.migrator.yml", "docker-compose.tools.yml"]) {
      const text = read(path);
      const config = parse(text) as { services: Record<string, any> };
      expect(text).toContain("POSTGRES_IMAGE:?exact postgres digest required");
      expect(text).toContain("POSTGRES_PASSWORD_FILE: /run/secrets/postgres_bootstrap_credential");
      expect(text).toContain("pg_isready -U postgres -d obsidian_clone");
      expect(config.services.postgres.secrets[0]).toMatchObject({ uid: "999", gid: "999", mode: "0400" });
      expect(config.services.postgres.ports).toBeUndefined();
    }
  });
});
