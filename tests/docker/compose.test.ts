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
    expect(compose).toContain("target: tools");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("DOCKER_DATABASE_URL");
    expect(compose).toContain("postgres:5432");
    expect(compose).toContain("NEXTAUTH_URL");
    expect(compose).toContain("localhost:3000");
    expect(compose).toContain("NEXTAUTH_SECRET");
    expect(compose).toContain('"${WEB_PORT:-3000}:3000"');
    expect(compose).toContain("web_storage:/app/storage");
    expect(compose).toContain("web_storage:");
  });

  test("uses a pgvector-enabled postgres image", () => {
    const compose = read("docker-compose.yml");

    expect(compose).toContain("pgvector/pgvector:0.8.2-pg16");
  });

  test("development override runs next dev from the dev image target", () => {
    const compose = read("docker-compose.dev.yml");

    expect(compose).toContain("target: dev");
    expect(compose).toContain("pnpm run dev");
    expect(compose).toContain("DOCKER_DATABASE_URL");
    expect(compose).toContain("postgres:5432");
    expect(compose).toContain("NEXTAUTH_URL");
    expect(compose).toContain(".:/app");
    expect(compose).toContain("/app/node_modules");
    expect(compose).toContain("/app/.next");
  });

  test("Dockerfile exposes production and development targets", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain("FROM deps AS tools");
    expect(dockerfile).toContain("FROM deps AS runner");
    expect(dockerfile).toContain("FROM deps AS dev");
    expect(dockerfile).toContain("pnpm run build");
    expect(dockerfile).toContain("COPY --from=builder /app/public ./public");
    expect(dockerfile).toContain("COPY --from=builder /app/next.config.mjs ./next.config.mjs");
    expect(dockerfile).not.toContain("next.config.ts");
    expect(dockerfile).toContain("pnpm prune --prod");
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
