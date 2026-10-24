---
id: workflow-production-observability
title: Production Observability Workflow
type: workflow
status: active
summary: Munjib production Docker 로그 확인, Sentry SaaS error/tracing/runtime metrics/Replay, low-cardinality app metrics 관측성 흐름.
created: 2026-06-03
updated: 2026-10-07
source_count: 45
tags:
  - munjib
  - workflow
  - observability
  - sentry
links:
  - "[[index|Wiki Index]]"
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Local Development Workflow]]"
  - "[[CI CD And Monitoring Workflow]]"
---

# Production Observability Workflow

Issue #248 adds [[RAG Quality Evaluation]] through an independent offline evaluation collector and private evaluation OTel provider. Production capture remains metadata-only; synthetic experiment uploads contain scores, case IDs and versions, with no question/context/answer or judge reasons.

이 page는 Munjib production-style Docker 서버에서 무엇을 Docker 로그로 보고, 무엇을 Sentry SaaS로 보낼지 나눈다. Issue #89의 첫 slice는 `@sentry/nextjs` 기반 error monitoring과 낮은 sample rate tracing을 production `web` container에 추가한다. Issue #116은 route가 처리해서 public response로는 `AI_UNAVAILABLE` 503 또는 Workspace AI NDJSON error event를 내보내는 provider/runtime failure도 sanitized Sentry event로 남긴다. Issue #135는 저비용/저운영 관측성 v1로 Sentry 런타임 메트릭, error-only Replay, low-cardinality application metrics를 추가하되 Grafana/Prometheus/PostHog 같은 별도 운영 플랫폼은 후속으로 미룬다. CI/CD deploy와 monitoring을 함께 보는 현재 운영 요약은 [[CI CD And Monitoring Workflow]]에 둔다.

## Entry points

Production-style Compose 서버의 startup, 환경 변수, DB 연결, PostgreSQL process log는 Docker stdout/stderr를 그대로 본다.

```bash
docker compose logs -f --tail=300 --timestamps web postgres
```

Sentry SaaS를 켜려면 production Docker image build와 runtime에 다음 값을 둔다.

```text
SENTRY_DSN=https://public@example.ingest.sentry.io/1
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=issue-89-local-build
SENTRY_TRACES_SAMPLE_RATE=0.05
SENTRY_RUNTIME_METRICS_ENABLED=true
SENTRY_RUNTIME_METRICS_INTERVAL_MS=60000
NEXT_PUBLIC_SENTRY_DSN=https://public@example.ingest.sentry.io/1
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_RELEASE=issue-89-local-build
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1
```

Issue #89 구현은 이 로그 흐름을 대체하지 않고 `@sentry/nextjs` 기반 SaaS error monitoring과 낮은 sample rate의 tracing을 추가한다. Next.js App Router manual setup에 맞춰 `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`를 사용한다.

Issue #100 구현은 Ask AI RAG의 LLM-specific observability에 Langfuse를 추가하되 Sentry/Docker 로그 역할을 대체하지 않는다. Langfuse full capture는 Node runtime instrumentation에서 OpenTelemetry `NodeSDK`와 `LangfuseSpanProcessor` exporter를 시작하고, answer generation에는 LangChain callback을 연결한다. 설정 누락, metadata capture, startup/exporter 실패, callback 생성 실패는 Ask AI request를 실패시키지 않는 fail-open layer다.

Issue #116 구현은 handled AI unavailable failure를 Sentry issue로 명시 capture한다. `captureHandledAiUnavailable()`은 Ask AI 503, Workspace AI preparation 503, Workspace AI post-start stream `AI_UNAVAILABLE` event에서 호출되며, Sentry init이 no-op인 환경에서는 호출 자체가 application response를 바꾸지 않는다.

## Steps

Sentry SaaS 첫 slice의 목표 범위:

- server-side request error, browser runtime error, App Router global error를 Sentry issue로 보낸다.
- `SENTRY_DSN` 또는 `NEXT_PUBLIC_SENTRY_DSN`이 비어 있으면 Sentry init은 no-op으로 둔다.
- `SENTRY_ENVIRONMENT`와 optional `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE`로 event를 운영 환경과 배포 단위에 tag한다.
- tracing은 `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`로 낮게 시작한다.
- server CPU/RAM/event-loop 같은 Node runtime metric은 `SENTRY_RUNTIME_METRICS_ENABLED=true`일 때만 `sentry.server.config.ts`에서 켜고, 기본 collection interval은 `SENTRY_RUNTIME_METRICS_INTERVAL_MS=60000`으로 둔다. Edge runtime에는 Node runtime metrics integration을 붙이지 않는다.
- Browser Replay는 `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` 또는 `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`가 0보다 클 때만 켠다. 저비용 steady state는 full session Replay를 0으로 두고 error-only Replay를 필요한 기간에만 켠다.
- Browser SDK에 필요한 `NEXT_PUBLIC_SENTRY_*` 값은 Next.js build time에 bundle되므로 Docker build args로도 전달한다.
- Source map upload는 첫 slice에서 제외하고, future CI/deployment step에서 `SENTRY_AUTH_TOKEN`을 build-time secret으로 다룰 때 추가한다.
- Server/Edge SDK init은 `sendDefaultPii: false`에 더해 Sentry `dataCollection`에서 user info, cookies, request/response headers, bodies, query params, genAI input/output, stack frame variables, frame context lines를 명시적으로 끈다.
- Browser/Server/Edge SDK init은 shared scrubber를 `beforeSend`, `beforeSendTransaction`, `beforeSendSpan`, `beforeBreadcrumb`, `beforeSendMetric`에 연결해 Sentry event의 request URL query/host, `query_string`, request body data, cookies, request headers, user IP, span URL/query/target/path/description/name fields, span request/response body/header/IP/host/user-agent attributes, breadcrumb URL/query/host fields, metric의 `server.address`와 user identity attributes를 제거한다. Browser navigation breadcrumb의 `from`/`to` query도 제거하고, console breadcrumb는 Docker stdout/console log 전체 수집을 피하기 위해 드롭한다. 이 scrubber는 Sentry SDK의 `dataCollection.queryParams: false`만으로 `event.request.url` query string, browser fetch/XHR span `url`, sampled trace span URL/body/header/IP/host fields, browser `location.href`/breadcrumb 계열 값이 보장 제거되지 않는 privacy gap을 막는다.
- Handled AI provider/runtime failures that are intentionally mapped to public `AI_UNAVAILABLE` still call Sentry explicitly. The event name is `HandledAiUnavailableError`, with tags/context for `ai.surface`, `workspace_slug`, `status`, `rag_error_code`, `chat_provider`, `chat_model`, and `stream_started` when applicable. The event fingerprint uses `handled-ai-unavailable`, surface, and stable RAG error code so Sentry grouping separates Ask AI and Workspace AI failure classes. The capture helper creates a sanitized error without attaching the original error or `cause`, so provider response bodies, prompts, questions, retrieved document content, answer text, API keys, base URLs, headers, cookies, and raw exception payloads are not sent.
- Low-cardinality application metrics use `captureMetricCount()` as a fail-open wrapper around `Sentry.metrics.count`. The first metric is `munjib.ai.unavailable` with `surface`, `status`, `rag_error_code`, `chat_provider`, and `stream_started`; workspace slug, model id, document id, question text, prompt, answer, API key, base URL, and raw provider response are not metric attributes.
- Dashboard v1 should start inside Sentry: Issues for error rate, Performance for sampled latency, Metrics for runtime/AI unavailable counts, and Replay for sampled error sessions. External Sentry Uptime and OCI native CPU/memory alarms are configured outside this repository. Grafana/Prometheus and PostHog are deferred until there is a concrete query or retention need that Sentry cannot cover cheaply.

`docker-compose.yml`의 `web` service는 runtime environment와 build args를 모두 가진다. `tools` service는 background maintenance command observability가 필요해질 때 별도 task에서 다루며, 현재 Sentry env를 받지 않는다.

## Failure modes

Sentry가 붙어도 container가 Sentry 초기화 전에 죽는 startup failure, 잘못된 `NEXTAUTH_URL`, DB 접속 실패, PostgreSQL 자체 오류는 Docker 로그가 1차 근거다.

Handled AI unavailable events are not expected to appear automatically in Sentry from thrown exceptions because the routes catch and normalize them. Ask AI and Workspace AI preparation failures continue to return the same JSON error response, and Workspace AI stream failures that happen after `{ "type": "start" }` continue to report an NDJSON error event rather than changing the HTTP status. The explicit Sentry capture is the production signal for these handled provider/runtime failures; Docker logs remain the source for raw provider stack traces, startup/config failures, environment shape, database errors, and container lifecycle.

잘못된 trace sample rate는 app startup failure로 만들지 않고 tracing disabled 상태로 낮춘다. Source map upload token은 runtime container env에 넣지 않는다.

문서 본문, query parameter 기반 document/search state, cookie, authorization header, network address, user IP, `DATABASE_URL`, `NEXTAUTH_SECRET` 같은 민감 값은 Sentry event context에 넣지 않는다. 첫 slice에서는 `sendDefaultPii`를 켜지 않는다.

잘못된 runtime metrics interval, Replay sample rate, application metric send failure는 request failure로 전파하지 않는다. Metric attributes는 low-cardinality allowlist만 사용하고, per-workspace/per-document/per-user label은 Sentry metric cardinality와 privacy 양쪽 문제를 만들 수 있으므로 넣지 않는다.

Langfuse production metadata capture now exports real observations through
`lib/rag/ai-observation.ts`. A private OpenTelemetry `BasicTracerProvider`
uses only manually constructed `munjib-ai-metadata` spans, independently of
Sentry's global provider and the opt-in full-content LangChain exporter.
Ask AI and Workspace AI (including anonymous Trial) record request roots and
preparation/indexing/embedding/retrieval/generation stages where executed.
Generation records provider-reported finite nonnegative token counts and the
validated model name; Langfuse can price models it recognizes. Missing usage
or unknown prices remain unknown, never fabricated as zero.

The export schema is an allowlist: model/provider, dimensions, result counts,
anonymous flag, timings, and stable failure codes. It never copies question,
answer, document/chunk text, prompt, actor/workspace/document/thread/visitor
identifiers, IP, cookies, or raw exceptions. Trace IDs are independently generated
per request. Anonymous Trial retains its existing metadata-only callback policy.
`MUNJIB_LANGFUSE_ENABLED=false` or missing keys disables the metadata exporter.

Export batches are asynchronous, have a five-second HTTP timeout, and flush in
Next `after()` after the response. Export failures emit only
`LANGFUSE_EXPORT_FAILED`, rate limited to once per minute, and cannot replace the
AI result. This is best-effort observability: process termination or SDK queue
pressure can lose pending spans; it is not an audit ledger.

Production uses the existing `munjib` project with both capture variables set
to `metadata`. Local development uses a separate `munjib-development` project
and its own key pair. Full-content capture remains an explicit development/test
opt-in and is not enabled for production diagnosis. Any future production
content capture needs a scoped operator workflow, source-side masking, and a
verified deletion policy. Langfuse Hobby's data access window is not automatic
retention deletion; do not describe it as a 30-day deletion policy.

Issue #227 source evidence: `lib/rag/ai-observation.ts`, the two AI services and
routes, `tests/rag/ai-observation.test.ts`, and
`tests/rag/ai-observation-export.test.ts` (real OTLP payload privacy test).


## Tests

Issue #89 자동 검증은 Sentry config helper unit test, behavioral event scrubber test, static Sentry integration file test, Docker contract test, TypeScript check, production build를 포함한다. 실제 Sentry event 전송 검증은 real DSN이 있는 서버 환경에서 temporary verification-only error path로 확인하고, permanent public test route는 남기지 않는다.

Issue #116 검증은 `captureHandledAiUnavailable()` unit test와 Ask AI / Workspace AI route tests를 포함한다. 이 tests는 handled RAG runtime failure가 sanitized helper를 호출하고, validation error와 archived thread 같은 non-provider-unavailable cases는 capture하지 않는지 확인한다. Abort handling은 route signal propagation과 stream/service abort behavior로 별도 검증된다.

Issue #135 검증은 Sentry config parsing test, static Sentry integration file test, metric scrubber test, application metrics helper test, handled AI unavailable metric test, Docker/Env contract test를 포함한다. 이 tests는 runtime metrics가 server config에만 붙고, browser Replay가 privacy masking option과 함께 opt-in되며, Docker build args가 public Replay sample rate를 Next.js build time에 전달하는지 확인한다.

## 근거

- GitHub issue #89
- GitHub issue #116
- GitHub issue #135
- `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`
- `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`
- `docs/superpowers/specs/2026-06-20-ai-provider-503-sentry-capture-design.md`
- `docs/superpowers/specs/2026-06-27-low-cost-production-observability-design.md`
- `docs/superpowers/plans/2026-06-03-sentry-saas-observability.md`
- `docs/superpowers/plans/2026-06-20-ai-provider-503-sentry-capture.md`
- `docs/superpowers/plans/2026-06-27-low-cost-production-observability.md`
- `lib/observability/sentry-config.ts`
- `lib/observability/sentry-scrub-event.ts`
- `lib/observability/application-metrics.ts`
- `lib/observability/ai-unavailable.ts`
- `instrumentation-client.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- `app/global-error.tsx`
- `docker-compose.yml`
- `lib/rag/langfuse.ts`
- `lib/rag/langfuse-otel.ts`
- `lib/rag/answer-chain.ts`
- `Dockerfile`
- `next.config.mjs`
- `.env.example`
- `.env.docker.example`
- `tests/observability/sentry-config.test.ts`
- `tests/observability/sentry-scrub-event.test.ts`
- `tests/observability/sentry-files.test.ts`
- `tests/observability/application-metrics.test.ts`
- `tests/observability/ai-unavailable.test.ts`
- `tests/docker/compose.test.ts`
- `tests/rag/langfuse.test.ts`
- `tests/rag/langfuse-otel.test.ts`
- `tests/rag/answer-chain.test.ts`
- `tests/rag/ask-route.test.ts`
- `tests/rag/workspace-chat-route.test.ts`
- [[Local Development Workflow]]
