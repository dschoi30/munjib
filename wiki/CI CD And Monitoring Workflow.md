---
id: workflow-ci-cd-monitoring
title: CI CD And Monitoring Workflow
type: workflow
status: active
summary: Munjib의 현재 GitHub Actions CI/CD, OCI native Compose build deploy, Docker/Sentry low-cost monitoring 구성.
created: 2026-06-05
updated: 2026-07-04
source_count: 53
tags:
  - munjib
  - workflow
  - ci-cd
  - deployment
  - monitoring
  - sentry
links:
  - "[[index|Wiki Index]]"
  - "[[Local Development Workflow]]"
  - "[[Production Observability Workflow]]"
  - "[[Project PRD]]"
  - "[[Wiki Maintenance Automation]]"
---

# CI CD And Monitoring Workflow

이 page는 현재 repository의 자동 검증, production compose deploy, monitoring 구성을 한 곳에서 본다. 세부 production observability 원칙은 [[Production Observability Workflow]]에 있고, 이 page는 CI/CD와 monitoring이 어떻게 이어지는지 요약한다.

## Entry points

CI/CD entry point는 `.github/workflows/ci-cd.yml` 하나다. Workflow 이름은 `CI/CD`이고, `pull_request`와 `main` branch push에서 실행된다.

Workflow는 `munjib-${{ github.ref }}` concurrency group을 사용해 같은 ref의 이전 run을 취소한다. 기본 permission은 repository read인 `contents: read`만 사용한다.

공통 workflow env:

```text
IMAGE_TAG=${{ github.sha }}
PNPM_VERSION=10.28.1
```

Production runtime entry point는 `docker-compose.yml`이다. `web` service는 `WEB_IMAGE`가 있으면 그 image tag를 쓰고, 없으면 `ghcr.io/dschoi30/munjib:latest`를 기본값으로 쓴다. 현재 production deploy job은 OCI host에서 `WEB_IMAGE=munjib-web:latest`로 `web`과 `tools`를 native build한다. `docker-compose.dev.yml`은 local development override이며 production CI/CD deploy path에는 직접 쓰이지 않는다.

Monitoring entry point는 두 갈래다.

- Docker stdout/stderr: startup, env, DB connection, PostgreSQL process log, Sentry init 이전 failure.
- Sentry SaaS: Next.js App Router request error, global error, browser runtime error, low sample rate tracing, opt-in Node runtime metrics, error-only Replay, low-cardinality application metrics.

Sentry Uptime checks and OCI native CPU/memory alarms are low-ops external controls and are configured outside the repository. Grafana/Prometheus and PostHog are intentionally deferred until Sentry cannot answer the needed infrastructure or product questions cheaply.

## Steps

### PR과 main 공통 CI

`ci` job은 `ubuntu-latest`에서 실행되고 `DATABASE_URL`은 GitHub Actions service PostgreSQL을 가리킨다.

```text
postgresql://obsidian:obsidian@localhost:5432/obsidian_clone?schema=public
```

CI service database는 `pgvector/pgvector:0.8.2-pg16` image를 사용하고 `pg_isready -U obsidian -d obsidian_clone` health check를 통과해야 한다.

현재 CI 순서:

1. `actions/checkout@v4`
2. Corepack enable과 `pnpm@10.28.1` activate
3. `actions/setup-node@v4` with Node.js `22` and pnpm cache
4. `pnpm install --frozen-lockfile`
5. `pnpm run db:generate`
6. `pnpm exec prisma migrate deploy`
7. `pnpm run db:rag:index`
8. `pnpm test`
9. `pnpm run build`
10. `docker build --target runner --tag munjib-ci:${IMAGE_TAG} .`

현재 PR CI는 Vitest, Next build, runtime image build까지 검증한다. Playwright e2e는 mandatory GitHub Actions gate에 포함되어 있지 않다.

### main deploy

`deploy` job은 `ci`가 성공한 `main` push에서만 실행된다. `appleboy/ssh-action@v1.2.0`으로 production server에 접속하고, OCI host에서 server checkout의 최신 source를 native Docker build한 뒤 compose project를 갱신한다.

Issue #96에서는 OCI instance가 `linux/arm64/v8` platform으로 GHCR image를 pull한다는 점을 반영해 Buildx/QEMU multi-platform publish를 시도했다. 그러나 follow-up main run `27017475831`의 `Publish image` job이 QEMU 기반 runtime image build/push에서 장시간 지연되어 취소되었고, Issue #98에서 deploy path를 GHCR publish/pull 대신 OCI host native build로 바꾸었다. 현재 workflow에는 `publish` job, GHCR login, `docker/build-push-action`, `docker/setup-qemu-action`, `packages: write` permission이 없다.

Deploy job env:

```text
WEB_IMAGE=munjib-web:latest
DEPLOY_SHA=${{ github.sha }}
SENTRY_RELEASE=${{ github.sha }}
NEXT_PUBLIC_SENTRY_RELEASE=${{ github.sha }}
DEPLOY_ENV_FILE=/etc/munjib/env
DEPLOY_HEALTHCHECK_URL=http://127.0.0.1:3000
DEPLOY_HEALTHCHECK_HOST=munjib.andrewchoi.link
DEPLOY_REPOSITORY=${{ github.repository }}
DEPLOY_GIT_TOKEN=${{ github.token }}
```

Browser SDK 값은 Next.js build time에 bundle된다. 현재 deploy는 OCI host에서 image를 build하므로 host-local `/etc/munjib/env`의 `NEXT_PUBLIC_SENTRY_*` 값과 deploy job이 전달하는 `NEXT_PUBLIC_SENTRY_RELEASE`가 compose build args로 들어가야 한다. 초기 production 관측 기간에는 trace sample rate를 일시적으로 `1.0`까지 올릴 수 있지만, Issue #135의 저비용 steady state는 낮은 trace sample rate, full session Replay `0`, 필요 시 error-only Replay만 켜는 구성을 기본으로 본다.

Required GitHub secrets:

```text
DEPLOY_HOST=146.56.170.25
DEPLOY_USER=ubuntu
DEPLOY_SSH_KEY=<OCI private key>
DEPLOY_PATH=/home/ubuntu/munjib
DEPLOY_PORT=22
```

Current OCI production domain:

```text
https://munjib.andrewchoi.link
```

Remote deploy 순서:

```bash
cd "${{ secrets.DEPLOY_PATH }}"
git_auth_header="$(printf 'x-access-token:%s' "$DEPLOY_GIT_TOKEN" | base64 | tr -d '\n')"
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $git_auth_header" fetch --force "https://github.com/$DEPLOY_REPOSITORY.git" main
git checkout --detach "$DEPLOY_SHA"
test "$(git rev-parse HEAD)" = "$DEPLOY_SHA"
sudo test -r "$DEPLOY_ENV_FILE"
sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose --env-file "$DEPLOY_ENV_FILE" build web tools
sudo env WEB_IMAGE="$WEB_IMAGE" docker compose --env-file "$DEPLOY_ENV_FILE" run --rm tools pnpm exec prisma migrate deploy
sudo env WEB_IMAGE="$WEB_IMAGE" docker compose --env-file "$DEPLOY_ENV_FILE" run --rm tools pnpm run db:rag:index
sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose --env-file "$DEPLOY_ENV_FILE" up -d web
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error --location --max-time 20 --header "Host: $DEPLOY_HEALTHCHECK_HOST" "$DEPLOY_HEALTHCHECK_URL" >/dev/null; then
    break
  fi
  if [ "$attempt" = "10" ]; then
    exit 1
  fi
  sleep 3
done
sudo docker image prune -f
```

이 deploy는 server checkout에서 Actions-provided ephemeral `github.token`을 Git HTTP extraheader로 사용해 repository `main`을 fetch한 뒤 workflow가 검증한 `github.sha`로 detached checkout을 고정하고, OCI ARM64 host에서 `web`과 `tools` image를 직접 build한다. 이 fetch 방식은 OCI server checkout의 stored HTTPS credential/token에 의존하지 않으며 token을 remote `.git/config`에 저장하지 않는다. OCI instance의 `ubuntu` user는 Docker socket에 직접 접근하지 못하므로 remote deploy는 `sudo docker` / `sudo env ... docker compose`를 사용한다. Build와 `up -d web`에는 release env를 전달하고, `tools` command는 이미 build된 image 선택에 필요한 `WEB_IMAGE`만 전달한다. Server checkout 기준으로 native build된 `tools` container에서 Prisma migration과 RAG vector index setup을 실행한 뒤 `web` service를 detached mode로 올린다. Remote script 안에서는 hairpin NAT 영향을 피하기 위해 `http://127.0.0.1:3000`에 `Host: munjib.andrewchoi.link` header를 붙인 local health check를 최대 10회 재시도하고, 성공 후 dangling image 정리를 위해 `sudo docker image prune -f`를 실행한다. SSH deploy step 뒤에는 GitHub-hosted runner에서 `https://munjib.andrewchoi.link` public health check를 별도 실행해 DNS/TLS/Caddy public path를 확인한다.

현재 deploy job에는 synthetic browser check와 Sentry event smoke test가 없다. 배포 후 상태 확인은 GitHub Actions log, public health check, server Docker logs, 필요 시 Sentry issue/trace 확인으로 수행한다.

OCI server production env는 repository checkout 안의 `.env`나 `.env.docker`가 아니라 host-local secret file `/etc/munjib/env`가 기준이다. Deploy workflow는 모든 remote Compose 명령에 `docker compose --env-file "$DEPLOY_ENV_FILE"`를 명시하고, 실제 compose interpolation은 이 파일과 workflow가 넘기는 release env를 함께 사용한다. `docker-compose.yml`의 `environment:` 항목은 `${VAR:-}` 형태라서 service-level `env_file`만 추가하면 빈 문자열이 우선되어 provider credentials가 계속 비는 문제가 생길 수 있다. 초기 production 관측 기간에는 Sentry trace sample rate를 `1.0`으로 둔다.

Issue #143의 email-only development login은 production에서 기본 disabled다. Controlled temporary access가 필요할 때만 `/etc/munjib/env`에 `MUNJIB_ENABLE_DEV_LOGIN=true`를 명시하며, `docker-compose.yml`은 이 값을 `web` service runtime env로 전달한다.

```text
NEXTAUTH_URL="https://munjib.andrewchoi.link"
NEXTAUTH_COOKIE_SECURE=true
WEB_IMAGE=munjib-web:latest
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=1.0
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0
MUNJIB_OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
MUNJIB_OPENAI_COMPATIBLE_API_KEY=<secret>
```

Issue #135 low-cost observability additions for the same host-local env file:

```text
SENTRY_RUNTIME_METRICS_ENABLED=true
SENTRY_RUNTIME_METRICS_INTERVAL_MS=60000
NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1
```

### Docker runtime

Production compose는 `postgres`, `web`, `tools` service를 가진다.

- `postgres`: `pgvector/pgvector:0.8.2-pg16`, named volume `postgres_data`, configurable host port `POSTGRES_PORT`.
- `web`: `runner` target 기반 production app, named volume `web_storage:/app/storage`, configurable host port `WEB_PORT`.
- `tools`: `tools` target 기반 maintenance command runner, `profiles: ["tools"]`.

`web` runtime env는 DB, NextAuth, Sentry error/tracing/runtime metrics, Browser Sentry build-time values, local Ollama/RAG 설정을 받는다. `tools` service는 DB, NextAuth, local Ollama/RAG 설정은 받지만 현재 Sentry env는 받지 않는다.
`MUNJIB_ENABLE_DEV_LOGIN`은 request-time auth helper가 읽는 launch gate이므로 production-style `web` runtime env에만 전달한다.

Dockerfile stages:

- `base`: Node.js 22 Alpine, Corepack, shared env.
- `deps`: frozen pnpm dependency install.
- `builder`: Browser Sentry DSN/environment/release/tracing/Replay build args를 env로 설정한 뒤 Prisma generate와 Next build.
- `tools`: maintenance command image.
- `runner`: production runtime image.
- `dev`: local development image.

## Monitoring

Docker log가 1차 운영 근거다.

```bash
docker compose logs -f --tail=300 --timestamps web postgres
```

Docker logs에서 먼저 볼 것:

- container startup failure
- 잘못된 `NEXTAUTH_URL`, `DATABASE_URL`, secret/env 설정
- DB connection failure
- PostgreSQL process log
- Sentry SDK init 전에 죽는 failure
- RAG/Ollama host 접근 문제

Sentry SaaS는 app-level error monitoring과 low sample rate tracing용이다. App Router integration 파일은 `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`다.

Sentry enable 조건:

- Browser: `NEXT_PUBLIC_SENTRY_DSN`이 있어야 init된다.
- Server/Edge: `SENTRY_DSN`을 우선 쓰고, 없으면 `NEXT_PUBLIC_SENTRY_DSN` fallback을 쓴다.
- DSN이 비어 있으면 Sentry init은 no-op이다.

Sentry environment/release/sample rate:

- Browser: `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- Server/Edge: `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`
- Server only: `SENTRY_RUNTIME_METRICS_ENABLED`, `SENTRY_RUNTIME_METRICS_INTERVAL_MS`
- Invalid trace sample rate는 startup failure가 아니라 tracing disabled 상태인 `0`으로 정규화된다.
- Invalid Replay sample rate and runtime metrics interval are normalized to low-cost defaults and do not fail startup.

Privacy contract:

- `sendDefaultPii: false`를 사용한다.
- Server/Edge `dataCollection`에서 user info, cookies, headers, bodies, query params, genAI input/output, stack frame variables, frame context lines를 끈다.
- Shared scrubber가 request URL query/host, `query_string`, request body, cookies, headers, user IP, span URL/query/network/user-agent fields, URL-like span names/descriptions, breadcrumb URL/query/host data를 제거한다.
- Metric scrubber가 Sentry metric attributes/tags에서 `server.address`, `user.email`, `user.id`, `user.name`을 제거한다.
- Console breadcrumb는 Docker stdout/console log 전체 수집을 피하기 위해 drop한다.
- Browser Replay는 켜져도 `maskAllText`, `maskAllInputs`, `blockAllMedia`를 사용한다.

현재 source map upload는 꺼져 있다. `next.config.mjs`는 `withSentryConfig`를 사용하지만 `sourcemaps.disable: true`이고, `SENTRY_AUTH_TOKEN`은 `.env.example`, `.env.docker.example`, compose runtime env에 포함하지 않는다.

## Failure modes

CI failure는 deploy를 막는다. Test, Next build, Docker `runner` build 중 하나라도 실패하면 production deploy가 일어나지 않는다.

Deploy secret이 빠지거나 SSH 접속이 실패하면 deploy job이 실패한다. PR validation에는 deploy secrets가 필요하지 않다.

Server checkout에서 Actions token 기반 repository fetch나 `DEPLOY_SHA` detached checkout이 실패하면 deploy가 source sync 단계에서 멈춘다. OCI host native Docker build가 실패하면 deploy가 `docker compose build web tools` 단계에서 멈춘다.

GHCR image가 `linux/arm64` manifest를 포함하지 않으면 OCI deploy는 과거 `docker compose pull web` 단계에서 `no matching manifest for linux/arm64/v8` 오류로 실패했다. Issue #96은 publish job을 QEMU 기반 multi-platform build/push로 바꾸는 중간 fix였고, Issue #98은 long-running QEMU publish를 제거해 OCI host에서 ARM64 image를 직접 build하도록 바꾼 현재 fix다.

Prisma migration이나 RAG vector index setup이 실패하면 `web` restart 전에 deploy가 멈춘다. Remote local health check가 실패하면 public runner health check까지 가지 않고 deploy가 실패한다. Remote local health check는 app container response를 확인하고, public runner health check는 외부 DNS/TLS/Caddy path를 확인한다. pgvector extension/table/index 상태 문제는 GitHub Actions service DB와 production DB 양쪽에서 확인해야 한다.

Browser Sentry 설정은 build-time bundle이다. `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`가 잘못된 image를 이미 build했다면 production runtime env 수정만으로 browser bundle이 고쳐지지 않는다. Native OCI deploy에서는 host-local `/etc/munjib/env`와 deploy job release env를 고친 뒤 새 build가 필요하다.

Sentry는 Docker log를 대체하지 않는다. Startup/env/DB/PostgreSQL 문제와 Sentry init 이전 crash는 Docker stdout/stderr를 먼저 본다.

## Tests

현재 CI/CD와 monitoring 계약은 다음 테스트가 고정한다.

```bash
pnpm exec vitest run tests/github-actions/ci-cd.test.ts tests/docker/compose.test.ts
pnpm exec vitest run tests/observability/sentry-config.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/sentry-files.test.ts tests/observability/application-metrics.test.ts tests/observability/ai-unavailable.test.ts
```

Full CI path에서는 `pnpm test`, `pnpm run build`, Docker `runner` target build가 실행된다. `main` deploy path에서는 OCI host의 `docker compose build web tools`, Prisma migration deploy, RAG vector index setup, public HTTPS health check가 실행된다. Local wiki maintenance 후에는 `pnpm wiki:manifest`와 `pnpm wiki:lint`로 frontmatter, manifest, link 구조를 확인한다.

## 근거

- GitHub issue #88
- GitHub issue #89
- GitHub issue #94
- GitHub issue #96
- GitHub issue #98
- GitHub issue #135
- GitHub issue #143
- GitHub Actions run `27016407598` deploy failure log
- GitHub Actions run `27017475831` cancelled publish log
- PR #99 review threads
- PR #144 review threads
- GitHub issue #133
- `.github/workflows/ci-cd.yml`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `.env.example`
- `.env.docker.example`
- `docs/superpowers/specs/2026-06-27-low-cost-production-observability-design.md`
- `docs/superpowers/plans/2026-06-27-low-cost-production-observability.md`
- `next.config.mjs`
- `instrumentation-client.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `lib/observability/application-metrics.ts`
- `instrumentation.ts`
- `app/global-error.tsx`
- `lib/observability/sentry-config.ts`
- `lib/observability/sentry-scrub-event.ts`
- `tests/github-actions/ci-cd.test.ts`
- `tests/auth/login-gate-callers.test.ts`
- `tests/docker/compose.test.ts`
- `tests/observability/sentry-config.test.ts`
- `tests/observability/sentry-scrub-event.test.ts`
- `tests/observability/sentry-files.test.ts`
- `tests/observability/application-metrics.test.ts`
- `tests/observability/ai-unavailable.test.ts`
- OCI server read-only inspection for `munjib.andrewchoi.link`
- [[Local Development Workflow]]
- [[Production Observability Workflow]]
