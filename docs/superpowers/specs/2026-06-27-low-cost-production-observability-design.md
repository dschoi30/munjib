# Low-Cost Production Observability Design

## Context

Issue #135 extends Munjib's existing production observability without adding a
new always-on monitoring platform. The current production contract keeps Docker
stdout/stderr as the first source for startup, environment, database, and
container lifecycle failures, while Sentry handles Next.js application errors,
low-sample tracing, and sanitized handled AI provider failures.

The selected operating preference is low cost and low operational burden. This
means the first slice should strengthen Sentry and the existing OCI/Docker
workflow before introducing Grafana, PostHog, Datadog, or another pipeline.

## Goals

- Add Node.js runtime health metrics to server-side Sentry initialization.
- Keep runtime metrics explicitly configurable so production can enable them
  without surprising local development or test environments.
- Add error-only Session Replay support with strict default privacy masking.
- Keep Replay configurable through public build-time variables because browser
  Sentry config is bundled at `next build` time.
- Add a small Application Metrics helper for privacy-safe, low-cardinality
  counters.
- Emit a counter when handled AI provider/runtime failures are normalized to
  `AI_UNAVAILABLE`.
- Preserve the public AI error contract and existing sanitized Sentry issue
  capture behavior.
- Document that Grafana/PostHog remain deferred until Sentry and OCI signals no
  longer cover the operational question.

## Non-Goals

- Do not add Grafana, Prometheus, Loki, PostHog, Datadog, or New Relic in this
  slice.
- Do not collect document markdown, prompts, questions, retrieved chunks, answer
  bodies, headers, cookies, user identifiers, API keys, provider base URLs, or
  request/response bodies in metrics or Replay.
- Do not enable full-session Replay by default.
- Do not upload Sentry source maps.
- Do not change public `AI_UNAVAILABLE` API responses.
- Do not add database migrations.

## Architecture

Add configuration fields to the existing Sentry config helper:

- `SENTRY_RUNTIME_METRICS_ENABLED`
- `SENTRY_RUNTIME_METRICS_INTERVAL_MS`
- `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`

Server Sentry initialization will add `Sentry.nodeRuntimeMetricsIntegration()`
only when server Sentry is enabled and runtime metrics are enabled. The default
collection interval is 60 seconds to reduce metrics volume.

Browser Sentry initialization will add `Sentry.replayIntegration()` only when at
least one Replay sample rate is greater than zero. Replay will keep
`maskAllText`, `maskAllInputs`, and `blockAllMedia` enabled.

Add `lib/observability/application-metrics.ts` as the single wrapper around
`Sentry.metrics`. The wrapper will drop undefined attributes, catch SDK errors,
and keep metric calls side-effect-only.

Extend the Sentry scrubber with `scrubSentryMetric()` and attach it via
`beforeSendMetric` in browser, server, and edge Sentry initialization. The
metric scrubber removes default or accidental attributes such as `server.address`
and `user.*`.

## Metrics

Runtime metrics, when enabled, come from the Sentry Node runtime metrics
integration:

- `node.runtime.mem.rss`
- `node.runtime.mem.heap_used`
- `node.runtime.mem.heap_total`
- `node.runtime.cpu.utilization`
- `node.runtime.event_loop.delay.p99`
- `node.runtime.event_loop.utilization`

Application metric added in this slice:

```text
munjib.ai.unavailable
```

Allowed attributes:

- `surface`
- `rag_error_code`
- `status`
- `stream_started`
- `chat_provider`

Do not add workspace slug or chat model as metric attributes in this slice to
avoid high-cardinality metrics. Those values remain available in sanitized
Sentry issue context for individual failure debugging.

## Rollout

Production can enable the low-cost v1 with:

```text
SENTRY_RUNTIME_METRICS_ENABLED=true
SENTRY_RUNTIME_METRICS_INTERVAL_MS=60000
NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1
```

Sentry Uptime and OCI alarms are configured outside the codebase. This feature
documents them but does not provision them.

## Testing

- Unit test config parsing for runtime metrics and Replay sample rates.
- Static test Sentry initialization files for runtime metrics, error-only
  Replay privacy settings, and metric scrubber usage.
- Unit test the metric scrubber.
- Unit test the Application Metrics helper.
- Extend handled AI unavailable tests to assert the low-cardinality metric call.
- Update Docker/env contract tests for new Sentry env/build values.

## Wiki

Update:

- `wiki/Production Observability Workflow.md`
- `wiki/CI CD And Monitoring Workflow.md`
- `wiki/index.md`
- `wiki/log.md`

Run the standard wiki manifest/lint/sync flow before commit.
