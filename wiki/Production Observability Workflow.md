---
id: workflow-production-observability
title: Production Observability Workflow
type: workflow
status: active
summary: Munjib production Docker 로그 확인과 Issue #89 Sentry SaaS error/tracing 관측성 흐름.
created: 2026-06-03
updated: 2026-06-13
source_count: 25
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

이 page는 Munjib production-style Docker 서버에서 무엇을 Docker 로그로 보고, 무엇을 Sentry SaaS로 보낼지 나눈다. Issue #89의 첫 slice는 `@sentry/nextjs` 기반 error monitoring과 낮은 sample rate tracing을 production `web` container에 추가한다. CI/CD deploy와 monitoring을 함께 보는 현재 운영 요약은 [[CI CD And Monitoring Workflow]]에 둔다.

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
NEXT_PUBLIC_SENTRY_DSN=https://public@example.ingest.sentry.io/1
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_RELEASE=issue-89-local-build
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
```

Issue #89 구현은 이 로그 흐름을 대체하지 않고 `@sentry/nextjs` 기반 SaaS error monitoring과 낮은 sample rate의 tracing을 추가한다. Next.js App Router manual setup에 맞춰 `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`를 사용한다.

Issue #100 구현은 Ask AI RAG의 LLM-specific observability에 Langfuse를 추가하되 Sentry/Docker 로그 역할을 대체하지 않는다. Langfuse full capture는 Node runtime instrumentation에서 OpenTelemetry `NodeSDK`와 `LangfuseSpanProcessor` exporter를 시작하고, answer generation에는 LangChain callback을 연결한다. 설정 누락, metadata capture, startup/exporter 실패, callback 생성 실패는 Ask AI request를 실패시키지 않는 fail-open layer다.

## Steps

Sentry SaaS 첫 slice의 목표 범위:

- server-side request error, browser runtime error, App Router global error를 Sentry issue로 보낸다.
- `SENTRY_DSN` 또는 `NEXT_PUBLIC_SENTRY_DSN`이 비어 있으면 Sentry init은 no-op으로 둔다.
- `SENTRY_ENVIRONMENT`와 optional `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE`로 event를 운영 환경과 배포 단위에 tag한다.
- tracing은 `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`로 낮게 시작한다.
- Browser SDK에 필요한 `NEXT_PUBLIC_SENTRY_*` 값은 Next.js build time에 bundle되므로 Docker build args로도 전달한다.
- Source map upload는 첫 slice에서 제외하고, future CI/deployment step에서 `SENTRY_AUTH_TOKEN`을 build-time secret으로 다룰 때 추가한다.
- Server/Edge SDK init은 `sendDefaultPii: false`에 더해 Sentry `dataCollection`에서 user info, cookies, request/response headers, bodies, query params, genAI input/output, stack frame variables, frame context lines를 명시적으로 끈다.
- Browser/Server/Edge SDK init은 shared scrubber를 `beforeSend`, `beforeSendTransaction`, `beforeSendSpan`, `beforeBreadcrumb`에 연결해 Sentry event의 request URL query/host, `query_string`, request body data, cookies, request headers, user IP, span URL/query/target/path/description/name fields, span request/response body/header/IP/host/user-agent attributes, breadcrumb URL/query/host fields를 제거한다. Browser navigation breadcrumb의 `from`/`to` query도 제거하고, console breadcrumb는 Docker stdout/console log 전체 수집을 피하기 위해 드롭한다. 이 scrubber는 Sentry SDK의 `dataCollection.queryParams: false`만으로 `event.request.url` query string, browser fetch/XHR span `url`, sampled trace span URL/body/header/IP/host fields, browser `location.href`/breadcrumb 계열 값이 보장 제거되지 않는 privacy gap을 막는다.

`docker-compose.yml`의 `web` service는 runtime environment와 build args를 모두 가진다. `tools` service는 background maintenance command observability가 필요해질 때 별도 task에서 다루며, 현재 Sentry env를 받지 않는다.

## Failure modes

Sentry가 붙어도 container가 Sentry 초기화 전에 죽는 startup failure, 잘못된 `NEXTAUTH_URL`, DB 접속 실패, PostgreSQL 자체 오류는 Docker 로그가 1차 근거다.

잘못된 trace sample rate는 app startup failure로 만들지 않고 tracing disabled 상태로 낮춘다. Source map upload token은 runtime container env에 넣지 않는다.

문서 본문, query parameter 기반 document/search state, cookie, authorization header, network address, user IP, `DATABASE_URL`, `NEXTAUTH_SECRET` 같은 민감 값은 Sentry event context에 넣지 않는다. 첫 slice에서는 `sendDefaultPii`를 켜지 않는다.

Langfuse production traces도 같은 privacy 방향을 따른다. 기본 production capture는 provider/model, embedding dimensions, retrieved chunk count, citation document ids, error code 같은 metadata 중심으로 내부 invocation metadata를 구성하되, raw saved document content, retrieved chunk text, full prompt, question body, answer body, unsaved draft title/markdown egress를 막기 위해 Langfuse callback과 OpenTelemetry exporter를 붙이지 않는다. Full prompt/answer trace는 development 또는 명시적 opt-in에서만 허용하며, 현재 implementation은 explicit `full` capture에서만 Node runtime Langfuse OpenTelemetry exporter와 LangChain Langfuse callback을 연결한다. `MUNJIB_LANGFUSE_ENABLED=false`는 credential이 남아 있어도 config와 exporter startup 양쪽에서 Langfuse를 disabled로 유지한다.

## Tests

Issue #89 자동 검증은 Sentry config helper unit test, behavioral event scrubber test, static Sentry integration file test, Docker contract test, TypeScript check, production build를 포함한다. 실제 Sentry event 전송 검증은 real DSN이 있는 서버 환경에서 temporary verification-only error path로 확인하고, permanent public test route는 남기지 않는다.

## 근거

- GitHub issue #89
- `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`
- `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`
- `docs/superpowers/plans/2026-06-03-sentry-saas-observability.md`
- `lib/observability/sentry-config.ts`
- `lib/observability/sentry-scrub-event.ts`
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
- `tests/docker/compose.test.ts`
- `tests/rag/langfuse.test.ts`
- `tests/rag/langfuse-otel.test.ts`
- `tests/rag/answer-chain.test.ts`
- [[Local Development Workflow]]
