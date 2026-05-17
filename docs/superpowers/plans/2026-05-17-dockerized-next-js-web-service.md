# Dockerized Next.js Web Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Docker support for running Munjib's PostgreSQL database and Next.js web service together in production-style and development modes.

**Architecture:** Use a multi-stage Dockerfile with separate production runner and development targets. Keep `docker-compose.yml` as the default production-style web+DB entry point, and add `docker-compose.dev.yml` as the source-mounted development override. Document explicit Prisma schema and seed commands rather than hiding them in container startup.

**Tech Stack:** Next.js 15, pnpm 10, Prisma, PostgreSQL 16 Alpine, Docker Compose, Vitest.

---

## File Structure

- Create `Dockerfile`: multi-stage pnpm/Next.js image with `runner` and `dev` targets.
- Create `.dockerignore`: exclude local-only and generated files from Docker build context.
- Modify `docker-compose.yml`: add the production-style `web` service beside the existing `postgres` service.
- Create `docker-compose.dev.yml`: override `web` for source-mounted `next dev`.
- Create `.env.docker.example`: document container-safe environment values.
- Create `tests/docker/compose.test.ts`: static Docker contract tests.
- Modify `wiki/Local Development Workflow.md`: add Docker commands and host/container DB URL distinction.
- Modify `wiki/index.md`, `wiki/log.md`, and regenerate `wiki/manifest.json`: record durable workflow knowledge.

### Task 1: Docker Contract Test

**Files:**
- Create: `tests/docker/compose.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Docker web service configuration", () => {
  test("default compose runs web with the existing postgres service", () => {
    const compose = read("docker-compose.yml");

    expect(compose).toContain("postgres:");
    expect(compose).toContain("web:");
    expect(compose).toContain("target: runner");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("postgresql://obsidian:obsidian@postgres:5432/obsidian_clone?schema=public");
    expect(compose).toContain('"3000:3000"');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/docker/compose.test.ts`

Expected: FAIL because `tests/docker/compose.test.ts` expects Docker files and service settings that do not exist yet.

### Task 2: Docker Files

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `docker-compose.yml`
- Create: `docker-compose.dev.yml`
- Create: `.env.docker.example`

- [ ] **Step 1: Implement Dockerfile**

Create a multi-stage Dockerfile with these stages: `base`, `deps`, `builder`, `runner`, and `dev`. Use `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm run db:generate`, `pnpm run build`, `pnpm prune --prod`, `EXPOSE 3000`, and the correct `CMD` for each runtime target.

- [ ] **Step 2: Implement Compose services**

Add a `web` service to `docker-compose.yml` with `build.target: runner`, `depends_on.postgres.condition: service_healthy`, port `3000:3000`, and container `DATABASE_URL` pointing at `postgres:5432`.

- [ ] **Step 3: Implement development override**

Create `docker-compose.dev.yml` that changes `web.build.target` to `dev`, bind mounts `.:/app`, uses anonymous `/app/node_modules` and `/app/.next` volumes, and runs `pnpm run dev`.

- [ ] **Step 4: Document Docker env defaults**

Create `.env.docker.example` with `DATABASE_URL`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` values for the Compose network.

- [ ] **Step 5: Run test to verify Docker files pass static contract**

Run: `pnpm exec vitest run tests/docker/compose.test.ts`

Expected: PASS.

### Task 3: Wiki Maintenance

**Files:**
- Modify: `wiki/Local Development Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update local development workflow**

Add a Docker section that documents:

```bash
docker compose up --build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
docker compose run --rm web pnpm exec prisma migrate deploy
docker compose run --rm web pnpm exec prisma db push
docker compose run --rm web pnpm run db:seed
```

- [ ] **Step 2: Update wiki index and log**

Mention Docker web+DB startup in the local development status entry and append a log entry referencing Issue #50, `Dockerfile`, `docker-compose.yml`, and `docker-compose.dev.yml`.

- [ ] **Step 3: Regenerate manifest and run wiki lint**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: manifest updates successfully and lint passes.

### Task 4: Verification and Completion

**Files:**
- All files above

- [ ] **Step 1: Run focused static test**

Run: `pnpm exec vitest run tests/docker/compose.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Build Docker production image**

Run: `docker compose build web`

Expected: web image builds successfully.

- [ ] **Step 4: Start Compose and verify HTTP response**

Run: `docker compose up -d postgres web`, then check `http://localhost:3000`.

Expected: the web service starts and returns an HTTP response. If Prisma tables are missing, run `docker compose run --rm web pnpm exec prisma db push` and `docker compose run --rm web pnpm run db:seed`, then restart/check again.

- [ ] **Step 5: Commit-time wiki sync**

Run:

```bash
git add Dockerfile .dockerignore docker-compose.yml docker-compose.dev.yml .env.docker.example tests/docker/compose.test.ts wiki
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: wiki sync checks pass.

- [ ] **Step 6: Commit, push, PR, and review check**

Commit and push `issue-50-dockerized-next-js-web-service`, create the PR, mark ready/request review, wait at least 5 minutes, then inspect review threads and checks.
