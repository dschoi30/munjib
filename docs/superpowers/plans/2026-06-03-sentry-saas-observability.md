# Sentry SaaS Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sentry SaaS error monitoring and low-sample tracing to the Munjib Next.js production Docker deployment without replacing Docker stdout log monitoring.

**Architecture:** Use the official `@sentry/nextjs` App Router setup with root-level instrumentation files and a small repo-owned config parser. Docker passes public Sentry values at image build time for browser bundles and runtime Sentry values through the `web` container environment. Source map upload, Sentry structured logs, replay, profiling, and self-hosted Sentry remain out of scope.

**Tech Stack:** Next.js 15 App Router, TypeScript, `@sentry/nextjs`, Docker Compose, Vitest, Munjib wiki maintenance CLI.

---

### Task 0: Implementation Context Check

**Files:**
- Read: `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`
- Read: `wiki/Production Observability Workflow.md`
- Read: `docker-compose.yml`
- Read: `next.config.mjs`
- No source edits in this task.

- [ ] **Step 1: Confirm branch and clean working tree**

Run: `git status --short --branch`

Expected: branch is `issue-89-add-sentry-saas-observability` and no unstaged or untracked files are present before implementation starts.

- [ ] **Step 2: Confirm design commit is present**

Run: `git log --oneline -3`

Expected: output includes:

```text
f4d0c3d docs: design Sentry SaaS observability
```

- [ ] **Step 3: Re-read the accepted design**

Run: `sed -n '1,240p' docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`

Expected: output confirms these constraints:

```text
Do not self-host Sentry.
Do not send all `console.log` output or Docker stdout to Sentry.
Do not upload source maps in this first slice.
Do not commit `SENTRY_AUTH_TOKEN` or require it at runtime.
```

### Task 1: Add Sentry Dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add the official Next.js SDK**

Run: `pnpm add @sentry/nextjs`

Expected: `package.json` gains an `@sentry/nextjs` dependency and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Inspect dependency diff**

Run: `git diff -- package.json pnpm-lock.yaml`

Expected: only dependency metadata changed. No application source files are changed in this task.

- [ ] **Step 3: Checkpoint dependency update**

Run:

```bash
git status --short package.json pnpm-lock.yaml
```

Expected: output lists only `package.json` and `pnpm-lock.yaml` as modified. Do not commit yet; this repository's wiki sync hook treats dependency metadata as durable source, so the implementation and wiki maintenance should be committed together after final verification.

### Task 2: Sentry Configuration Parser

**Files:**
- Create: `lib/observability/sentry-config.ts`
- Create: `tests/observability/sentry-config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/observability/sentry-config.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  getBrowserSentryConfig,
  getServerSentryConfig,
  parseTraceSampleRate,
} from "@/lib/observability/sentry-config";

describe("Sentry observability config", () => {
  test("disables server Sentry when no DSN is configured", () => {
    expect(getServerSentryConfig({ NODE_ENV: "production" })).toEqual({
      dsn: undefined,
      enabled: false,
      environment: "production",
      release: undefined,
      tracesSampleRate: 0,
    });
  });

  test("uses server DSN, environment, release, and trace sample rate", () => {
    expect(
      getServerSentryConfig({
        NODE_ENV: "production",
        SENTRY_DSN: " https://public@example.ingest.sentry.io/1 ",
        SENTRY_ENVIRONMENT: " staging ",
        SENTRY_RELEASE: " image-2026-06-03 ",
        SENTRY_TRACES_SAMPLE_RATE: "0.05",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enabled: true,
      environment: "staging",
      release: "image-2026-06-03",
      tracesSampleRate: 0.05,
    });
  });

  test("falls back to the public DSN for server config", () => {
    const config = getServerSentryConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/2",
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.01",
    });

    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe("https://public@example.ingest.sentry.io/2");
    expect(config.environment).toBe("production");
    expect(config.tracesSampleRate).toBe(0.01);
  });

  test("keeps browser config limited to public values", () => {
    expect(
      getBrowserSentryConfig({
        NODE_ENV: "production",
        SENTRY_DSN: "https://server@example.ingest.sentry.io/1",
        SENTRY_ENVIRONMENT: "server",
        SENTRY_RELEASE: "server-release",
        SENTRY_TRACES_SAMPLE_RATE: "0.5",
        NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/1",
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "browser",
        NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.02",
      }),
    ).toEqual({
      dsn: "https://browser@example.ingest.sentry.io/1",
      enabled: true,
      environment: "browser",
      release: undefined,
      tracesSampleRate: 0.02,
    });
  });

  test.each([
    [undefined, 0],
    ["", 0],
    ["0", 0],
    ["1", 1],
    ["0.25", 0.25],
    [" -0.1 ", 0],
    ["1.1", 0],
    ["not-a-number", 0],
  ])("parses trace sample rate %j as %d", (raw, expected) => {
    expect(parseTraceSampleRate(raw)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the config tests to verify failure**

Run: `pnpm exec vitest run tests/observability/sentry-config.test.ts`

Expected: FAIL because `@/lib/observability/sentry-config` does not exist.

- [ ] **Step 3: Implement config parser**

Create `lib/observability/sentry-config.ts`:

```ts
export type SentryEnv = Record<string, string | undefined>;

export type SentryConfig = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  release: string | undefined;
  tracesSampleRate: number;
};

const DEFAULT_ENVIRONMENT = "development";

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function defaultEnvironment(env: SentryEnv) {
  return env.NODE_ENV === "production" ? "production" : DEFAULT_ENVIRONMENT;
}

export function parseTraceSampleRate(raw: string | undefined) {
  const value = nonEmpty(raw);

  if (!value) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return 0;
  }

  return parsed;
}

export function getServerSentryConfig(env: SentryEnv = process.env): SentryConfig {
  const dsn = nonEmpty(env.SENTRY_DSN) ?? nonEmpty(env.NEXT_PUBLIC_SENTRY_DSN);
  const environment =
    nonEmpty(env.SENTRY_ENVIRONMENT) ??
    nonEmpty(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ??
    defaultEnvironment(env);

  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    release: nonEmpty(env.SENTRY_RELEASE),
    tracesSampleRate: parseTraceSampleRate(
      env.SENTRY_TRACES_SAMPLE_RATE ?? env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ),
  };
}

export function getBrowserSentryConfig(env: SentryEnv = process.env): SentryConfig {
  const dsn = nonEmpty(env.NEXT_PUBLIC_SENTRY_DSN);

  return {
    dsn,
    enabled: Boolean(dsn),
    environment: nonEmpty(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ?? defaultEnvironment(env),
    release: undefined,
    tracesSampleRate: parseTraceSampleRate(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
  };
}
```

- [ ] **Step 4: Run config tests**

Run: `pnpm exec vitest run tests/observability/sentry-config.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint config helper**

Run:

```bash
git status --short lib/observability/sentry-config.ts tests/observability/sentry-config.test.ts
```

Expected: output lists the new config helper and test files. Do not commit yet; commit after wiki maintenance in Task 5.

### Task 3: Next.js Sentry SDK Wiring

**Files:**
- Create: `instrumentation-client.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Create: `instrumentation.ts`
- Create: `app/global-error.tsx`
- Create: `tests/observability/sentry-files.test.ts`
- Modify: `next.config.mjs`

- [ ] **Step 1: Write failing static integration tests**

Create `tests/observability/sentry-files.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Sentry Next.js integration files", () => {
  test("registers server and edge Sentry config through Next instrumentation", () => {
    const source = read("instrumentation.ts");

    expect(source).toContain('await import("./sentry.server.config")');
    expect(source).toContain('await import("./sentry.edge.config")');
    expect(source).toContain("Sentry.captureRequestError");
  });

  test("initializes browser Sentry without PII, replay, feedback, or logs", () => {
    const source = read("instrumentation-client.ts");

    expect(source).toContain("getBrowserSentryConfig");
    expect(source).toContain("Sentry.init");
    expect(source).toContain("sendDefaultPii: false");
    expect(source).toContain("captureRouterTransitionStart");
    expect(source).not.toContain("replayIntegration");
    expect(source).not.toContain("feedbackIntegration");
    expect(source).not.toContain("enableLogs: true");
  });

  test("initializes server runtimes without PII or document context", () => {
    const serverSource = read("sentry.server.config.ts");
    const edgeSource = read("sentry.edge.config.ts");

    for (const source of [serverSource, edgeSource]) {
      expect(source).toContain("getServerSentryConfig");
      expect(source).toContain("Sentry.init");
      expect(source).toContain("sendDefaultPii: false");
      expect(source).not.toContain("DATABASE_URL");
      expect(source).not.toContain("NEXTAUTH_SECRET");
      expect(source).not.toContain("contentMarkdown");
    }
  });

  test("captures App Router global errors", () => {
    const source = read("app/global-error.tsx");

    expect(source).toContain('"use client"');
    expect(source).toContain("Sentry.captureException(error)");
    expect(source).toContain("<NextError statusCode={0} />");
  });

  test("wraps Next config while disabling source map upload", () => {
    const source = read("next.config.mjs");

    expect(source).toContain('import { withSentryConfig } from "@sentry/nextjs";');
    expect(source).toContain("withSentryConfig(nextConfig");
    expect(source).toContain("sourcemaps");
    expect(source).toContain("disable: true");
    expect(source).toContain("telemetry: false");
  });
});
```

- [ ] **Step 2: Run static tests to verify failure**

Run: `pnpm exec vitest run tests/observability/sentry-files.test.ts`

Expected: FAIL because the Sentry integration files do not exist yet.

- [ ] **Step 3: Add browser instrumentation**

Create `instrumentation-client.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { getBrowserSentryConfig } from "@/lib/observability/sentry-config";

const config = getBrowserSentryConfig();

if (config.enabled) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    sendDefaultPii: false,
    tracesSampleRate: config.tracesSampleRate,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 4: Add server and edge runtime config**

Create `sentry.server.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { getServerSentryConfig } from "@/lib/observability/sentry-config";

const config = getServerSentryConfig();

if (config.enabled) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    sendDefaultPii: false,
    tracesSampleRate: config.tracesSampleRate,
  });
}
```

Create `sentry.edge.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { getServerSentryConfig } from "@/lib/observability/sentry-config";

const config = getServerSentryConfig();

if (config.enabled) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    sendDefaultPii: false,
    tracesSampleRate: config.tracesSampleRate,
  });
}
```

- [ ] **Step 5: Add Next.js instrumentation entrypoint**

Create `instrumentation.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 6: Add global App Router error capture**

Create `app/global-error.tsx`:

```tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Wrap Next config with Sentry**

Replace `next.config.mjs` with:

```js
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: {
    disable: true,
  },
  telemetry: false,
});
```

- [ ] **Step 8: Run Sentry config and static integration tests**

Run: `pnpm exec vitest run tests/observability/sentry-config.test.ts tests/observability/sentry-files.test.ts`

Expected: PASS.

- [ ] **Step 9: Run type check**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 10: Checkpoint SDK wiring**

Run:

```bash
git status --short instrumentation-client.ts sentry.server.config.ts sentry.edge.config.ts instrumentation.ts app/global-error.tsx next.config.mjs tests/observability/sentry-files.test.ts
```

Expected: output lists only the Sentry SDK wiring files from this task. Do not commit yet; commit after wiki maintenance in Task 5.

### Task 4: Docker And Environment Contract

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `.env.docker.example`
- Modify: `tests/docker/compose.test.ts`

- [ ] **Step 1: Write failing Docker contract assertions**

In `tests/docker/compose.test.ts`, extend the `default compose runs web with the existing postgres service` test with these assertions:

```ts
expect(compose).toContain("NEXT_PUBLIC_SENTRY_DSN");
expect(compose).toContain("NEXT_PUBLIC_SENTRY_ENVIRONMENT");
expect(compose).toContain("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE");
expect(compose).toContain("SENTRY_DSN");
expect(compose).toContain("SENTRY_ENVIRONMENT");
expect(compose).toContain("SENTRY_RELEASE");
expect(compose).toContain("SENTRY_TRACES_SAMPLE_RATE");
```

Extend the `Dockerfile exposes production and development targets` test with these assertions:

```ts
expect(dockerfile).toContain("ARG NEXT_PUBLIC_SENTRY_DSN");
expect(dockerfile).toContain("ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT");
expect(dockerfile).toContain("ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE");
expect(dockerfile).toContain("ARG SENTRY_RELEASE");
expect(dockerfile).toContain("ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN");
expect(dockerfile).toContain("ENV SENTRY_RELEASE=$SENTRY_RELEASE");
```

Add this test inside the same `describe` block:

```ts
test("environment examples document Sentry SaaS settings without auth tokens", () => {
  const localEnv = read(".env.example");
  const dockerEnv = read(".env.docker.example");

  for (const envFile of [localEnv, dockerEnv]) {
    expect(envFile).toContain("SENTRY_DSN=");
    expect(envFile).toContain("SENTRY_ENVIRONMENT=");
    expect(envFile).toContain("SENTRY_RELEASE=");
    expect(envFile).toContain("SENTRY_TRACES_SAMPLE_RATE=");
    expect(envFile).toContain("NEXT_PUBLIC_SENTRY_DSN=");
    expect(envFile).toContain("NEXT_PUBLIC_SENTRY_ENVIRONMENT=");
    expect(envFile).toContain("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=");
    expect(envFile).not.toContain("SENTRY_AUTH_TOKEN");
  }
});
```

- [ ] **Step 2: Run Docker contract tests to verify failure**

Run: `pnpm exec vitest run tests/docker/compose.test.ts`

Expected: FAIL because Sentry build args, environment values, and env example entries have not been added.

- [ ] **Step 3: Add Sentry build args to Dockerfile**

In `Dockerfile`, replace the builder stage header:

```dockerfile
FROM deps AS builder

COPY . .
RUN pnpm run db:generate
RUN pnpm run build
```

with:

```dockerfile
FROM deps AS builder

ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0.05"
ARG SENTRY_RELEASE=""

ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

COPY . .
RUN pnpm run db:generate
RUN pnpm run build
```

- [ ] **Step 4: Add Sentry build args and runtime env to Compose**

In `docker-compose.yml`, replace the `web.build` block:

```yaml
    build:
      context: .
      target: runner
```

with:

```yaml
    build:
      context: .
      target: runner
      args:
        NEXT_PUBLIC_SENTRY_DSN: ${NEXT_PUBLIC_SENTRY_DSN:-}
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: ${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-production}
        NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: ${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:-0.05}
        SENTRY_RELEASE: ${SENTRY_RELEASE:-}
```

In the `web.environment` block, add these values below `NEXTAUTH_COOKIE_SECURE`:

```yaml
      SENTRY_DSN: ${SENTRY_DSN:-}
      SENTRY_ENVIRONMENT: ${SENTRY_ENVIRONMENT:-production}
      SENTRY_RELEASE: ${SENTRY_RELEASE:-}
      SENTRY_TRACES_SAMPLE_RATE: ${SENTRY_TRACES_SAMPLE_RATE:-0.05}
      NEXT_PUBLIC_SENTRY_DSN: ${NEXT_PUBLIC_SENTRY_DSN:-}
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: ${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-production}
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: ${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:-0.05}
```

Do not add Sentry values to the `tools` service in this task.

- [ ] **Step 5: Add env example entries**

Append to `.env.example`:

```dotenv
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0
```

Append to `.env.docker.example`:

```dotenv
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0.05
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
```

- [ ] **Step 6: Run Docker contract tests**

Run: `pnpm exec vitest run tests/docker/compose.test.ts`

Expected: PASS.

- [ ] **Step 7: Checkpoint Docker/env contract**

Run:

```bash
git status --short Dockerfile docker-compose.yml .env.example .env.docker.example tests/docker/compose.test.ts
```

Expected: output lists the Docker, env example, and Docker contract test files. Do not commit yet; commit after wiki maintenance in Task 5.

### Task 5: Wiki Maintenance And Final Verification

**Files:**
- Modify: `wiki/Production Observability Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec vitest run tests/observability/sentry-config.test.ts tests/observability/sentry-files.test.ts tests/docker/compose.test.ts`

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `pnpm run build`

Expected: PASS. The build must not require `SENTRY_AUTH_TOKEN`, must not attempt source map upload, and must still produce a normal Next.js production build.

- [ ] **Step 4: Update observability wiki**

In `wiki/Production Observability Workflow.md`, update the opening implementation-status sentence from design-only to implemented first slice:

```md
이 page는 Munjib production-style Docker 서버에서 무엇을 Docker 로그로 보고, 무엇을 Sentry SaaS로 보낼지 나눈다. Issue #89의 첫 slice는 `@sentry/nextjs` 기반 error monitoring과 낮은 sample rate tracing을 production `web` container에 추가한다.
```

In the `## Entry points` section, keep the Docker log command and add this Sentry env block after it:

````md
Sentry SaaS를 켜려면 production Docker image build와 runtime에 다음 값을 둔다.

```text
SENTRY_DSN=https://public@example.ingest.sentry.io/1
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=issue-89-local-build
SENTRY_TRACES_SAMPLE_RATE=0.05
NEXT_PUBLIC_SENTRY_DSN=https://public@example.ingest.sentry.io/1
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
```
````

In `wiki/index.md`, change the status-board entry beginning `Production observability planning:` to:

```md
- Production observability: Issue #89 keeps Docker stdout as the startup/env/DB/PostgreSQL log path and adds Sentry SaaS for Next.js App Router error monitoring plus low sample rate tracing. Browser SDK env is bundled at Next.js build time, so `NEXT_PUBLIC_SENTRY_*` values are passed as Docker build args as well as runtime env. Source map upload and `SENTRY_AUTH_TOKEN` remain excluded from the first slice. Details are in [[Production Observability Workflow]] and `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`.
```

Run `date +%Y-%m-%dT%H:%M:%S%z` and use that exact output as the heading timestamp. For example, if the command returns `2026-06-03T19:10:00+0900`, prepend this entry to `wiki/log.md`:

```md
## 2026-06-03T19:10:00+0900 - issue-89 sentry observability

- Result: Sentry SaaS error monitoring and low sample rate tracing were wired into the Next.js App Router production Docker web service.
- Coverage: `@sentry/nextjs` initializes browser, Node, and Edge runtimes only when a DSN is configured; App Router global errors and request errors are captured; Docker build args carry `NEXT_PUBLIC_SENTRY_*` values for the browser bundle; runtime `web.environment` carries server and public Sentry values. Source map upload, Sentry structured logs, replay, profiling, and `SENTRY_AUTH_TOKEN` remain out of scope.
- Pages: [[Production Observability Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #89, `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`, `lib/observability/sentry-config.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`, `next.config.mjs`, `Dockerfile`, `docker-compose.yml`.
- Verification: `pnpm exec vitest run tests/observability/sentry-config.test.ts tests/observability/sentry-files.test.ts tests/docker/compose.test.ts`, `pnpm exec tsc --noEmit`, `pnpm run build`.
```

- [ ] **Step 5: Run wiki maintenance commands**

Run:

```bash
git add package.json pnpm-lock.yaml lib/observability/sentry-config.ts tests/observability/sentry-config.test.ts instrumentation-client.ts sentry.server.config.ts sentry.edge.config.ts instrumentation.ts app/global-error.tsx next.config.mjs tests/observability/sentry-files.test.ts Dockerfile docker-compose.yml .env.example .env.docker.example tests/docker/compose.test.ts wiki/Production\ Observability\ Workflow.md wiki/index.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: `pnpm wiki:lint` may continue to warn about the pre-existing unresolved `wiki/designs/sidebar.md` pasted image link, but exits successfully. `pnpm wiki:sync-check --staged` exits successfully because source and wiki maintenance files are staged together.

- [ ] **Step 6: Commit implementation and wiki maintenance together**

Run:

```bash
git status --short
git commit -m "feat: add Sentry SaaS observability"
```

Expected: status shows only files from Tasks 1-5 staged, and commit succeeds with the wiki sync hook enabled.

- [ ] **Step 7: Push branch and create PR**

Run:

```bash
git push -u origin issue-89-add-sentry-saas-observability
gh pr create --title "Add Sentry SaaS observability" --body "Closes #89"
```

Expected: PR is created for issue #89.

- [ ] **Step 8: Mark PR ready and wait for review**

Run:

```bash
gh pr ready
sleep 300
```

Expected: PR is ready for review and at least 5 minutes pass before checking feedback.

- [ ] **Step 9: Check reviews, threads, comments, and CI**

Run:

```bash
PR_NUMBER=$(gh pr view --json number --jq .number)
gh pr view --json number,state,isDraft,reviewDecision,mergeStateStatus,statusCheckRollup,reviews,comments
gh api graphql -f query='
query($owner:String!, $repo:String!, $number:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      reviewThreads(first:100) {
        nodes {
          isResolved
          comments(first:20) {
            nodes {
              author { login }
              body
              path
              line
            }
          }
        }
      }
    }
  }
}' -F owner=dschoi30 -F repo=munjib -F number="$PR_NUMBER"
```

Expected: no unresolved actionable review threads, no failing required checks, and no blocking CI status. If there is actionable feedback or a failing check, fix it on the same branch, rerun the focused tests, type check, build, wiki sync commands, commit, push, wait again, and repeat this review check.

## Plan Self-Review

- Spec coverage: dependency install, Sentry App Router files, request/global/browser error capture, low-sample tracing, disabled no-DSN behavior, environment/release tags, Docker build/runtime env, source map upload exclusion, no logs/replay/profiling, tests, wiki maintenance, and PR review workflow are covered.
- Placeholder scan: no `TBD`, `TODO`, or ambiguous "add tests" steps remain.
- Type consistency: `getServerSentryConfig`, `getBrowserSentryConfig`, `parseTraceSampleRate`, `SentryConfig`, and env key names are introduced before they are used by later tasks.
