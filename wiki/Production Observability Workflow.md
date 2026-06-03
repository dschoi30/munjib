---
id: workflow-production-observability
title: Production Observability Workflow
type: workflow
status: active
summary: Munjib production Docker 로그 확인과 Issue #89 Sentry SaaS 관측성 설계 범위.
created: 2026-06-03
updated: 2026-06-03
source_count: 8
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
---

# Production Observability Workflow

이 page는 Munjib production-style Docker 서버에서 무엇을 Docker 로그로 보고, 무엇을 Sentry SaaS로 보낼지 나눈다. Issue #89의 Sentry 도입은 아직 구현 전 설계 단계이며, 현재형 구현으로 과장하지 않는다.

## Entry points

Production-style Compose 서버의 startup, 환경 변수, DB 연결, PostgreSQL process log는 Docker stdout/stderr를 그대로 본다.

```bash
docker compose logs -f --tail=300 --timestamps web postgres
```

Issue #89 설계와 구현 계획은 이 로그 흐름을 대체하지 않고 `@sentry/nextjs` 기반 SaaS error monitoring과 낮은 sample rate의 tracing을 추가한다. Next.js App Router manual setup에 맞춰 `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`를 추가하는 방향이다.

## Steps

Sentry SaaS 첫 slice의 목표 범위:

- server-side request error, browser runtime error, App Router global error를 Sentry issue로 보낸다.
- `SENTRY_DSN` 또는 `NEXT_PUBLIC_SENTRY_DSN`이 비어 있으면 Sentry init은 no-op으로 둔다.
- `SENTRY_ENVIRONMENT`와 optional `SENTRY_RELEASE`로 event를 운영 환경과 배포 단위에 tag한다.
- tracing은 `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`로 낮게 시작한다.
- Browser SDK에 필요한 `NEXT_PUBLIC_SENTRY_*` 값은 Next.js build time에 bundle되므로 Docker build args로도 전달한다.
- Source map upload는 첫 slice에서 제외하고, future CI/deployment step에서 `SENTRY_AUTH_TOKEN`을 build-time secret으로 다룰 때 추가한다.

`docker-compose.yml`의 `web` service는 runtime environment와 build args를 모두 검증해야 한다. `tools` service는 background maintenance command observability가 필요해질 때 별도 task에서 다룬다.

## Failure modes

Sentry가 붙어도 container가 Sentry 초기화 전에 죽는 startup failure, 잘못된 `NEXTAUTH_URL`, DB 접속 실패, PostgreSQL 자체 오류는 Docker 로그가 1차 근거다.

잘못된 trace sample rate는 app startup failure로 만들지 않고 tracing disabled 상태로 낮춘다. Source map upload token은 runtime container env에 넣지 않는다.

문서 본문, cookie, authorization header, `DATABASE_URL`, `NEXTAUTH_SECRET` 같은 민감 값은 Sentry event context에 넣지 않는다. 첫 slice에서는 `sendDefaultPii`를 켜지 않는다.

## Tests

Issue #89 구현 계획은 `docs/superpowers/plans/2026-06-03-sentry-saas-observability.md`에 둔다. 자동 검증은 Sentry config helper unit test, static Sentry integration file test, Docker contract test, TypeScript check, production build를 포함해야 한다. 실제 Sentry event 전송 검증은 real DSN이 있는 서버 환경에서 temporary verification-only error path로 확인하고, permanent public test route는 남기지 않는다.

## 근거

- GitHub issue #89
- `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`
- `docs/superpowers/plans/2026-06-03-sentry-saas-observability.md`
- `docker-compose.yml`
- `Dockerfile`
- `next.config.mjs`
- `tests/docker/compose.test.ts`
- [[Local Development Workflow]]
