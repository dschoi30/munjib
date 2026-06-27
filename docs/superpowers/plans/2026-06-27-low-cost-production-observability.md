# Low-Cost Production Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a low-cost production observability v1 by extending existing Sentry config with runtime metrics, error-only Replay, and a privacy-safe AI unavailable metric.

**Architecture:** Keep Sentry as the only new runtime signal path in this slice. Server config owns Node runtime metrics, browser config owns error-only Replay, and a small `lib/observability/application-metrics.ts` helper owns Sentry Application Metrics calls.

**Tech Stack:** Next.js App Router, `@sentry/nextjs`, Vitest, Docker Compose env contract tests, Munjib wiki maintenance scripts.

---

### Task 1: Extend Sentry Config Parsing

**Files:**
- Modify: `lib/observability/sentry-config.ts`
- Modify: `tests/observability/sentry-config.test.ts`

- [ ] **Step 1: Write failing config tests**

Add tests that expect server config to parse `SENTRY_RUNTIME_METRICS_ENABLED=true`, default interval `60000`, explicit interval override, and browser config to parse Replay sample rates from `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` and `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`.

- [ ] **Step 2: Run config tests and verify RED**

Run: `corepack pnpm exec vitest run tests/observability/sentry-config.test.ts --reporter=dot`
Expected: FAIL because config objects do not expose runtime metric or Replay fields yet.

- [ ] **Step 3: Implement config fields**

Add safe parsers for booleans, sample rates, and positive intervals. Return default runtime metrics disabled, interval `60000`, Replay session sample `0`, and Replay-on-error sample `0`.

- [ ] **Step 4: Run config tests and verify GREEN**

Run: `corepack pnpm exec vitest run tests/observability/sentry-config.test.ts --reporter=dot`
Expected: PASS.

### Task 2: Add Metric Scrubbing and Runtime/Replay Initialization

**Files:**
- Modify: `lib/observability/sentry-scrub-event.ts`
- Modify: `sentry.server.config.ts`
- Modify: `sentry.edge.config.ts`
- Modify: `instrumentation-client.ts`
- Modify: `tests/observability/sentry-scrub-event.test.ts`
- Modify: `tests/observability/sentry-files.test.ts`

- [ ] **Step 1: Write failing static and scrubber tests**

Assert server config uses `nodeRuntimeMetricsIntegration`, only server config contains it, browser config uses `replayIntegration` with `maskAllText`, `maskAllInputs`, and `blockAllMedia`, and all Sentry init files pass `beforeSendMetric: scrubSentryMetric`. Add scrubber behavior for `server.address`, `user.id`, `user.name`, and `user.email`.

- [ ] **Step 2: Run observability tests and verify RED**

Run: `corepack pnpm exec vitest run tests/observability/sentry-files.test.ts tests/observability/sentry-scrub-event.test.ts --reporter=dot`
Expected: FAIL because metric scrubber, runtime metrics, and Replay are not wired yet.

- [ ] **Step 3: Implement scrubber and initialization**

Export `scrubSentryMetric()` from `sentry-scrub-event.ts`. Import it in browser/server/edge Sentry config. Add server-only `integrations: [Sentry.nodeRuntimeMetricsIntegration(...)]` when runtime metrics are enabled. Add browser-only `integrations: [Sentry.replayIntegration(...)]` when Replay sample rates are non-zero.

- [ ] **Step 4: Run observability tests and verify GREEN**

Run: `corepack pnpm exec vitest run tests/observability/sentry-files.test.ts tests/observability/sentry-scrub-event.test.ts --reporter=dot`
Expected: PASS.

### Task 3: Add Application Metrics Helper and AI Unavailable Counter

**Files:**
- Create: `lib/observability/application-metrics.ts`
- Create: `tests/observability/application-metrics.test.ts`
- Modify: `lib/observability/ai-unavailable.ts`
- Modify: `tests/observability/ai-unavailable.test.ts`

- [ ] **Step 1: Write failing helper and AI metric tests**

Test that `captureMetricCount()` calls `Sentry.metrics.count` with compacted attributes, drops undefined attributes, and swallows SDK failures. Extend AI unavailable tests to expect one `munjib.ai.unavailable` count with `surface`, `rag_error_code`, `status`, `stream_started`, and `chat_provider`, but no workspace slug or chat model.

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm exec vitest run tests/observability/application-metrics.test.ts tests/observability/ai-unavailable.test.ts --reporter=dot`
Expected: FAIL because helper and metric emission do not exist yet.

- [ ] **Step 3: Implement helper and AI metric call**

Create the helper and call it from `captureHandledAiUnavailable()` before the Sentry issue capture path.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `corepack pnpm exec vitest run tests/observability/application-metrics.test.ts tests/observability/ai-unavailable.test.ts --reporter=dot`
Expected: PASS.

### Task 4: Update Docker Env Contract and Docs

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `.env.docker.example`
- Modify: `tests/docker/compose.test.ts`
- Modify: `wiki/Production Observability Workflow.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`

- [ ] **Step 1: Write failing Docker/env tests**

Extend Docker contract tests to expect runtime metrics env in `web.environment`, public Replay build args and runtime env, and environment examples documenting low-cost defaults.

- [ ] **Step 2: Run Docker tests and verify RED**

Run: `corepack pnpm exec vitest run tests/docker/compose.test.ts --reporter=dot`
Expected: FAIL because new env values are not present.

- [ ] **Step 3: Implement Docker/env/wiki updates**

Add the env/build args and update wiki pages to describe the Sentry-first low-cost v1, deferred Grafana/PostHog, Sentry Uptime, OCI alarms, and Docker logs.

- [ ] **Step 4: Run Docker tests and wiki commands**

Run: `corepack pnpm exec vitest run tests/docker/compose.test.ts --reporter=dot`
Expected: PASS.

Run: `corepack pnpm wiki:manifest`
Expected: manifest updates successfully.

Run: `corepack pnpm wiki:lint`
Expected: exit 0, allowing known unresolved image warning if it appears.

### Task 5: Final Verification and PR

**Files:**
- All touched files.

- [ ] **Step 1: Run focused verification**

Run:

```bash
corepack pnpm exec vitest run tests/observability/sentry-config.test.ts tests/observability/sentry-files.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/application-metrics.test.ts tests/observability/ai-unavailable.test.ts tests/docker/compose.test.ts --reporter=dot
corepack pnpm exec tsc --noEmit --pretty false
```

- [ ] **Step 2: Run wiki sync**

Run:

```bash
corepack pnpm wiki:install-hooks
git add .
corepack pnpm wiki:sync-plan --staged
corepack pnpm wiki:manifest
corepack pnpm wiki:lint
corepack pnpm wiki:sync-check --staged
```

- [ ] **Step 3: Commit, push, PR, and review loop**

Commit the implementation, push `issue-135-low-cost-production-observability`, create the PR, mark it ready, wait at least five minutes, then re-check review threads and CI per AGENTS.md.
