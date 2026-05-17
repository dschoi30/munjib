import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Docker web service configuration", () => {
  test("default compose runs web with the existing postgres service", () => {
    const compose = read("docker-compose.yml");

    expect(compose).toContain("postgres:");
    expect(compose).toContain("web:");
    expect(compose).toContain("target: runner");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain(
      "postgresql://obsidian:obsidian@postgres:5432/obsidian_clone?schema=public",
    );
    expect(compose).toContain('"${WEB_PORT:-3000}:3000"');
  });

  test("development override runs next dev from the dev image target", () => {
    const compose = read("docker-compose.dev.yml");

    expect(compose).toContain("target: dev");
    expect(compose).toContain("pnpm run dev");
    expect(compose).toContain(".:/app");
    expect(compose).toContain("/app/node_modules");
    expect(compose).toContain("/app/.next");
  });

  test("Dockerfile exposes production and development targets", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain("FROM base AS runner");
    expect(dockerfile).toContain("FROM base AS dev");
    expect(dockerfile).toContain("pnpm run build");
    expect(dockerfile).toContain('CMD ["pnpm", "start"]');
    expect(dockerfile).toContain('CMD ["pnpm", "run", "dev"]');
  });

  test("dockerignore keeps local artifacts out of image builds", () => {
    const dockerignore = read(".dockerignore");

    expect(dockerignore).toContain("node_modules");
    expect(dockerignore).toContain(".next");
    expect(dockerignore).toContain(".env");
    expect(dockerignore).toContain(".worktrees");
  });
});
