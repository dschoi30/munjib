---
id: workflow-local-development
title: Local Development Workflow
type: workflow
status: active
summary: Munjib 로컬 개발, Docker web+DB, DB, seed, test, e2e, feature start, wiki maintenance 명령.
created: 2026-04-29
updated: 2026-07-04
source_count: 65
tags:
  - munjib
  - workflow
  - development
links:
  - "[[Munjib]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Document Editing Workflow]]"
  - "[[CI CD And Monitoring Workflow]]"
  - "[[Wiki Schema]]"
  - "[[Wiki Maintenance Automation]]"
---

# Local Development Workflow

이 repository는 pnpm 기반 Next.js 애플리케이션이다. package manager는 `package.json`의 `packageManager` 필드 기준 `pnpm@10.28.1`이다.

## 주요 명령

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm test
pnpm run test:e2e
pnpm run test:e2e:ui
```

DB 관련 명령:

```bash
pnpm run db:generate
pnpm run db:migrate
pnpm run db:rag:index
pnpm run db:seed
```

Document retention maintenance 명령:

```bash
pnpm run documents:purge-archived -- --dry-run
pnpm run documents:purge-archived -- --workspace company-handbook
```

## Zero-egress browser oracle

Task 3 browser oracle은 test-only provider와 probe alias를 명시적으로 켜서 실행한다. Probe는 docker-compose.egress-test.yml의 egress-test profile에만 있고 production Compose에는 없다. Provider/auth test routes는 MUNJIB_E2E_PROVIDER_TRANSPORT=true와 MUNJIB_DEPLOYMENT_ENV=test 또는 development 조합에서만 활성화된다.

CI=1 DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' NEXTAUTH_SECRET='test-secret' NEXTAUTH_URL='http://localhost:3000' pnpm exec playwright test tests/e2e/zero-egress-rendering.spec.ts --project=chromium

The oracle calibrates browser/server canaries before clearing counters, then asserts no probe request, image optimizer fetch, speculative link, CSS/DOM sink, auth/session media, or settled client stream leak.

Issue #119 이후 archived document purge는 `Workspace.archivedDocumentRetentionPolicy`와 `Document.archivedAt` cutoff를 읽어 expired archived document를 hard delete하는 CLI/tools command다. 삭제 실행 전에는 `--dry-run`으로 대상 count를 확인한다. Docker 환경에서는 `docker compose run --rm tools pnpm run documents:purge-archived -- --dry-run`처럼 tools container에서 실행할 수 있으며, production 주기 실행은 host cron, Docker tools, 또는 future scheduled workflow 중 하나로 묶는 후속 작업이다.

Issue #73 이후 local Postgres는 pgvector extension이 설치된 image가 필요하다. `localhost:55432`에 예전 `postgres:16-alpine` container가 남아 있으면 `prisma migrate dev`의 shadow database 단계에서 `extension "vector" is not available` / `vector.control` 오류가 난다. 이 경우 기존 DB를 보존하려면 `.env`의 `POSTGRES_PORT`와 `DATABASE_URL`을 다른 port로 맞춘 뒤 현재 `docker-compose.yml`의 `pgvector/pgvector:0.8.2-pg16` Postgres를 띄운다.

```text
POSTGRES_PORT=55433
DATABASE_URL="postgresql://obsidian:obsidian@localhost:55433/obsidian_clone?schema=public"
```

Prisma schema는 `DocumentChunk.embedding`을 `Unsupported("vector(1024)")`로 보지만 HNSW vector index는 datamodel로 round-trip하지 못한다. 그래서 Prisma migration은 extension/table/current relational indexes까지만 맡고, `pnpm run db:rag:index`가 `CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx" ... USING hnsw ("embedding" vector_cosine_ops)`를 별도로 실행한다. `pnpm run db:migrate`는 `prisma migrate dev` 뒤 이 index setup을 이어서 실행한다.

Wiki maintenance 명령:

```bash
pnpm wiki:find "<topic>"
pnpm wiki:feature-start "<feature title>"
pnpm wiki:sync-plan --staged
pnpm wiki:sync-check --staged
pnpm wiki:install-hooks
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:log
```

## 환경 변수

Prisma는 `DATABASE_URL`을 요구한다. 이전 로컬 검증에서는 PostgreSQL이 `127.0.0.1:55432`에서 실행되었고 다음 형태의 URL을 사용했다.

```text
postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public
```

NextAuth 개발 환경에서는 안정적인 dev secret fallback이 있다. 운영 환경에서는 명시적 secret을 설정해야 한다. Issue #143 이후 email-only development login은 `MUNJIB_ENABLE_DEV_LOGIN`으로 gate된다. Local development는 unset 상태에서도 seed user 로그인이 가능하지만, production은 `MUNJIB_ENABLE_DEV_LOGIN=true`를 명시한 경우에만 이 임시 login path를 연다.

Issue #100 이후 Ask AI RAG provider는 server-wide env로 고른다. 기본값은 기존 local Ollama 경로와 같은 chat provider `ollama`, embedding provider `ollama`, chat model `gemma4:e4b`, embedding model `bge-m3`, embedding dimensions `1024`, local base URL `http://localhost:11434`다. Official OpenAI는 `MUNJIB_RAG_CHAT_PROVIDER=openai` 또는 `MUNJIB_RAG_EMBED_PROVIDER=openai`와 `OPENAI_API_KEY`를 사용하고, OpenAI-compatible endpoint는 `openai-compatible`과 `MUNJIB_OPENAI_COMPATIBLE_BASE_URL`을 사용한다. `MUNJIB_OPENAI_COMPATIBLE_API_KEY`는 endpoint가 인증을 요구할 때만 설정하며, LM Studio, LocalAI, vLLM 같은 local unauthenticated endpoint에서는 비워둘 수 있다. 현재 DB vector index identity는 Ollama `bge-m3` 1024라 다른 embedding identity는 live Ask AI에서 fail-fast하며, reindex workflow는 별도 follow-up이다.

OpenRouter chat 테스트는 existing OpenAI-compatible provider path를 사용한다. API key와 base URL은 server env에만 두고, settings panel은 browser-local provider+model override만 저장한다. Issue #109 이후 사용자는 AI tab에서 provider를 `OpenRouter / OpenAI-compatible`로 바꾸고 preset이나 custom model id를 저장할 수 있으며, `Save custom model`은 현재 provider+model pair를 workspace-local custom list에도 등록한다. OpenRouter `:free` ids such as `google/gemma-4-31b-it:free` require the selected provider to be `openai-compatible`; when a legacy string-only browser override is read without provider metadata, the client infers OpenRouter-style ids as OpenAI-compatible and non-OpenRouter ids as Ollama.

```text
MUNJIB_RAG_CHAT_PROVIDER=openai-compatible
MUNJIB_OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
MUNJIB_OPENAI_COMPATIBLE_API_KEY=...
MUNJIB_RAG_CHAT_MODEL=openrouter/fusion
MUNJIB_RAG_EMBED_PROVIDER=ollama
MUNJIB_RAG_EMBED_MODEL=bge-m3
MUNJIB_RAG_EMBED_DIMENSIONS=1024
```

Langfuse tracing은 optional이다. `LANGFUSE_PUBLIC_KEY`와 `LANGFUSE_SECRET_KEY`가 없으면 disabled/fail-open이고, production-safe metadata capture가 기본이다. 기본 metadata mode는 prompt/context/question/answer body egress를 막기 위해 Langfuse callback과 OpenTelemetry exporter를 붙이지 않는다. `MUNJIB_LANGFUSE_CAPTURE=full` 또는 `MUNJIB_LANGFUSE_CAPTURE_MODE=full`은 명시적 opt-in으로만 사용하며, 둘 중 하나라도 `full`이면 full capture가 이긴다. 이때 Node runtime instrumentation이 Langfuse OpenTelemetry `NodeSDK`/`LangfuseSpanProcessor` exporter를 시작하고 answer generation에는 LangChain Langfuse callback이 연결된다. `MUNJIB_LANGFUSE_ENABLED=false`는 credential이 있어도 Langfuse startup과 callback을 끈다. Env sample은 `LANGFUSE_TRACING_ENVIRONMENT`, `LANGFUSE_BASEURL`, `LANGFUSE_BASE_URL`, `LANGFUSE_HOST`, `MUNJIB_LANGFUSE_ENABLED`를 문서화하고, Docker compose는 같은 값을 web container로 전달하되 legacy `MUNJIB_LANGFUSE_CAPTURE=full`을 덮지 않도록 `MUNJIB_LANGFUSE_CAPTURE_MODE` 기본값을 주입하지 않는다.

## Docker web+DB 실행

Issue #50부터 Docker는 기존 PostgreSQL container에 더해 Next.js web service도 함께 띄우는 경로를 제공한다. 기본 `docker-compose.yml`은 production-style `runner` image target을 사용하고, `docker-compose.dev.yml` override는 source-mounted `dev` target으로 `next dev`를 실행한다. Prisma schema/seed 같은 관리 명령은 devDependencies를 포함하는 `tools` target에서 실행한다.

Production-style container 실행:

```bash
docker compose up --build
```

Development container 실행:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Docker network 안의 web container는 PostgreSQL에 `postgres:5432`로 접속한다. Host machine에서 직접 Prisma/test를 실행할 때는 `.env`의 `POSTGRES_PORT`와 `DATABASE_URL`을 사용한다. Host용 `.env`의 `DATABASE_URL`과 충돌하지 않도록 Compose는 container DB override 변수로 `DOCKER_DATABASE_URL`을 사용한다.

Compose는 database row와 uploaded attachment file이 함께 남도록 named volume을 둘 다 둔다. `postgres_data`는 PostgreSQL data directory를 유지하고, `web_storage`는 web container의 `/app/storage`를 유지해 container 재생성 뒤에도 `storage/attachments` 파일을 보존한다.

기존 local DB container가 이미 `55432`를 사용 중이면 host port만 바꿔서 별도 compose project를 띄울 수 있다. Web container는 internal `postgres:5432`를 계속 쓰므로 app 설정은 바뀌지 않는다. 기존 local app이 `3000`을 사용 중이면 `WEB_PORT`와 `NEXTAUTH_URL`을 함께 바꿔 auth callback origin을 맞춘다. Production container를 HTTPS 없이 외부 HTTP IP로 임시 노출할 때는 browser가 session cookie를 저장할 수 있도록 `NEXTAUTH_COOKIE_SECURE=false`도 함께 둔다. Compose는 이 값을 `web`과 `tools` container environment에 명시적으로 전달한다. Production-style `web` service는 `MUNJIB_ENABLE_DEV_LOGIN`도 전달하므로, unset이면 production login gate가 닫히고 `true`일 때만 임시 development login을 열 수 있다.

```bash
POSTGRES_PORT=55433 docker compose up --build
POSTGRES_PORT=55433 WEB_PORT=3101 NEXTAUTH_URL=http://localhost:3101 docker compose up --build
WEB_PORT=80 NEXTAUTH_URL=http://146.56.170.25 NEXTAUTH_COOKIE_SECURE=false docker compose up --build
```

Issue #89부터 production-style `web` service는 Sentry SaaS error/tracing 설정을 받을 수 있다. Browser SDK 값은 Next.js build time에 bundle되므로 `NEXT_PUBLIC_SENTRY_*` 값은 runtime environment뿐 아니라 Docker build args로도 전달된다. Compose는 이 값을 `web` service에만 전달하고 `tools` service에는 전달하지 않는다. Source map upload와 `SENTRY_AUTH_TOKEN`은 첫 Sentry slice에서 제외한다.

```bash
SENTRY_DSN=https://public@example.ingest.sentry.io/1 \
SENTRY_ENVIRONMENT=production \
SENTRY_RELEASE=$(git rev-parse --short HEAD) \
SENTRY_TRACES_SAMPLE_RATE=0.05 \
NEXT_PUBLIC_SENTRY_DSN=https://public@example.ingest.sentry.io/1 \
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production \
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05 \
docker compose up --build
```

Issue #100 이후 production-style `web` service는 RAG provider와 optional Langfuse env도 받는다. Docker 안에서 Ollama를 host에서 실행할 때 기본 `MUNJIB_OLLAMA_BASE_URL`은 `http://host.docker.internal:11434`다. Compose는 provider selection, OpenAI/OpenAI-compatible credential/base URL, Langfuse key/host/capture env를 `web` service로 전달한다.

Issue #88부터 GitHub Actions CI/CD는 PR과 `main` push에서 pgvector PostgreSQL service를 띄우고 pnpm install, Prisma Client generate, Prisma migration deploy, RAG vector index setup, Vitest, Next build, Docker `runner` target build를 실행한다. Issue #98 이후 `main` push deploy는 GHCR publish/pull 없이 SSH로 production server의 `/home/ubuntu/munjib` checkout에서 Actions-provided ephemeral Git token으로 repository `main`을 fetch하고 workflow가 검증한 `DEPLOY_SHA=${{ github.sha }}`로 detached checkout을 고정한 뒤, OCI host에서 `WEB_IMAGE=munjib-web:latest`와 host-local `DEPLOY_ENV_FILE=/etc/munjib/env`로 `sudo env ... docker compose --env-file "$DEPLOY_ENV_FILE" build web tools`를 실행한다. Native build는 browser Sentry bundle이 유지되도록 `/etc/munjib/env`의 `NEXT_PUBLIC_SENTRY_*`와 deploy job의 `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` env를 Docker build args로 전달한다. 이후 built `tools` container에서 Prisma migration deploy와 RAG vector index setup을 실행하고, 같은 `--env-file`과 release env를 전달한 `docker compose up -d web`, remote local `http://127.0.0.1:3000` health check, dangling image prune, GitHub-hosted runner의 `https://munjib.andrewchoi.link` public health check 순서로 배포한다. 현재 OCI server env는 `NEXTAUTH_URL=https://munjib.andrewchoi.link`, `NEXTAUTH_COOKIE_SECURE=true`, 초기 Sentry trace sample rate `1.0`, OpenRouter/OpenAI-compatible base URL/API key를 `/etc/munjib/env`에서 제공한다. 세부 운영 contract는 [[CI CD And Monitoring Workflow]]를 본다.

Required GitHub secrets:

```text
DEPLOY_HOST=146.56.170.25
DEPLOY_USER=ubuntu
DEPLOY_SSH_KEY
DEPLOY_PATH=/home/ubuntu/munjib
DEPLOY_PORT=22
```

Docker web container에서 schema와 seed를 준비하는 명령:

```bash
docker compose run --rm tools pnpm exec prisma migrate deploy
docker compose run --rm tools pnpm exec prisma db push
docker compose run --rm tools pnpm run db:seed
```

`migrate deploy`는 migration 파일이 준비된 환경에 쓰고, 로컬 개발 DB를 현재 Prisma schema로 맞추는 임시 경로는 `prisma db push`를 쓴다. Seed 후에는 `company-handbook` workspace와 개발용 owner/editor/viewer user로 로그인 흐름을 확인할 수 있다.

## Seed와 로그인

`pnpm run db:seed`는 `company-handbook` workspace와 owner/editor/viewer seed user를 만든다. Seed는 반복 실행된 로컬 E2E가 fixture document/folder를 rename/archive한 뒤에도 Welcome, Engineering Runbook, Operations folder, Operations Runbook의 canonical title/slug/path/status를 복구한다. E2E 테스트는 seed 후 로그인과 workspace 문서 편집 흐름을 검증한다. `pnpm run test:e2e:ui`는 같은 seed 준비 후 Playwright UI mode를 열어 e2e 시나리오를 브라우저 UI에서 점검한다.

## Feature start

신규 기능 source 변경 전에는 GitHub issue를 먼저 발행한다.

```bash
pnpm wiki:feature-start "<feature title>"
```

성공 시 issue URL을 출력한다. 현재 branch가 `main`이면 `issue-<number>-<slug>` branch를 생성하고 전환한다. 이미 feature branch이면 branch를 새로 만들지 않는다.

`gh issue create`가 실패하면 issue template을 출력한다. 이 경우 구현을 시작하기 전에 출력된 template으로 GitHub issue를 수동 생성한다.

기존 feature branch에 다른 작업이 있으면 같은 checkout에서 새 feature를 이어서 구현하지 않는다. 먼저 issue를 만든 뒤 `git worktree`로 별도 작업공간을 만들거나, clean `main` checkout에서 issue branch를 생성한다. 이렇게 하면 `wiki:feature-start`가 "이미 feature branch"로 판단해 현재 branch에 머무르는 상황에서도 서로 다른 issue의 커밋이 섞이지 않는다.

예시:

```bash
git worktree add .worktrees/issue-25-markdown-heading-folding main
cd .worktrees/issue-25-markdown-heading-folding
pnpm wiki:feature-start "Markdown heading folding"
```

## Test coverage

현재 unit/integration test는 workspace permission, document-level permission, document service, wiki link parsing/reconciliation/autocomplete, document metadata parsing, attachment service, comment service, wiki CLI를 검증한다.

E2E는 개발 credentials login 후 workspace에 진입해 search/navigation, local graph, editor modes, tags/properties/links/comments, broken link document creation, folder-like document creation, quick switcher를 확인한다. Current Playwright config runs E2E with one worker because the specs share the same seeded account and mutable Welcome document. Attachment upload와 DB-backed service tests는 local `DATABASE_URL`이 필요하다.

Issue #158 Task 3의 `tests/e2e/zero-egress-rendering.spec.ts`는 별도 local probe listener를 browser와 Next 서버에서 calibration한 뒤 실제 저장 preview와 Workspace AI answer를 방문한다. Probe는 요청 method/path digest/caller만 기록하고 credentials나 외부 네트워크를 저장하지 않는다. `docker-compose.egress-test.yml`은 `egress-test` profile에서만 probe alias/service를 추가하며 production `docker-compose.yml`에는 probe service, host alias, port가 없다. 이 E2E는 Markdown external image가 click-only button으로 남고 `<img>`, optimizer request, speculative DNS/preconnect/preload, CSS/DOM/SSR destination sink로 새지 않는지 확인한다.

DB-backed Vitest runs need host access to local PostgreSQL. In Codex's restricted sandbox, tests that connect to `127.0.0.1:55432` can fail with Prisma `Can't reach database server` even when the Docker Postgres container is healthy. When that happens, first verify the container/port, for example:

```bash
POSTGRES_PORT=55432 docker compose ps
docker exec obsidian-clone-postgres-1 pg_isready -U obsidian -d obsidian_clone
```

If Postgres is ready, rerun the DB-backed command with sandbox escalation or another unsandboxed execution path instead of treating the failure as a product regression. The standard full-suite verification command is:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test
```

The same rule applies to `prisma db push`, migration, seed, and any focused Vitest file that calls `tests/setup/prisma.ts`. If port `55432` is already allocated by an existing Postgres container, use that ready container or choose an alternate `POSTGRES_PORT` and matching `DATABASE_URL`; do not start another compose project on the same host port.

## Service error codes

Service layer에서 caller/test가 비교하는 error code는 `lib/service-errors.ts`의 `SERVICE_ERROR_CODES`를 우선 사용한다. Folder/document service처럼 여러 module에서 공유하는 code는 문자열 literal을 직접 던지지 않고 이 상수 object를 참조해 drift를 줄인다.

## Wiki-first lookup

작업자는 broad `rg` 전에 `wiki/index.md`를 읽거나 `pnpm wiki:find "<topic>"`을 먼저 실행한다. wiki가 비어 있거나 stale하거나 raw source verification이 필요할 때만 source search로 내려간다.

## Commit-time wiki sync

Source 변경을 커밋하기 전에는 `pnpm wiki:sync-plan --staged`를 실행해 변경 파일에 맞는 wiki 후보 page를 확인한다. durable knowledge가 생긴 경우 후보 page와 [[index|Wiki Index]], [[log|Wiki Log]]를 갱신한 뒤 `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`를 실행한다.

`wiki:sync-check --staged`는 staged source change가 있는데 staged wiki maintenance change가 없으면 실패한다. `.githooks/pre-commit`은 이 검사를 커밋마다 자동 실행하며, `pnpm wiki:install-hooks`로 현재 checkout에 연결한다.

## Task completion and PR review

모든 task 종료 시에는 검증, wiki sync, 커밋, push까지 마친 뒤 자동으로 PR을 작성한다. 사용자가 별도 handoff를 지시하지 않은 상태에서 push/PR 생성을 선택하면 그 선택은 PR review workflow 시작으로 간주한다. PR body에는 branch/commit, validation command, 남은 risk를 기록한다.

PR을 만든 뒤에는 ready-for-review 또는 review request 상태를 만든 다음 바로 종료하지 않고 최소 5분 대기한다. 대기 후 PR review thread, review submission, inline comment, CI/check 상태를 확인하고, actionable feedback이나 실패 check가 있으면 같은 branch에서 추가 수정, 검증, wiki update, commit, push까지 수행한 뒤 review 상태를 다시 확인한다. 리뷰나 CI가 아직 없으면 그 상태를 명확히 남긴다. 인증, tooling, network 문제로 리뷰나 CI 확인이 막히면 누락하지 말고 blocker와 필요한 명령/권한을 최종 상태에 적는다.

PR merge 이후에는 관련 GitHub issue가 닫혔는지 반드시 확인한다. 자동 close keyword가 적용되지 않았거나 과거 open issue가 남아 있으면 `gh issue close <number> --reason completed`로 닫고, `gh issue list --state open` 또는 issue-specific 조회로 남은 open issue가 없는지 확인한다. 이 issue close 확인은 local `main` pull, feature branch 삭제, worktree cleanup과 같은 merge 후 정리 절차의 일부다.

## 근거

- `package.json`
- `.env.example`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `.dockerignore`
- `.env.docker.example`
- `public/.gitkeep`
- `tests/docker/compose.test.ts`
- `tests/setup/prisma.ts`
- `prisma/seed.ts`
- `playwright.config.ts`
- `tests/e2e/login.spec.ts`
- `lib/wiki/sync.ts`
- `lib/wiki/feature-start.ts`
- `lib/service-errors.ts`
- `.githooks/pre-commit`
- GitHub issue #143
- `lib/auth/config.ts`
- `app/workspaces/[workspaceSlug]/page.tsx`
- `tests/auth/login-gate-callers.test.ts`
- GitHub issue #25 branch separation recovery
- User workflow decision on automatic draft PR creation after every task
- User workflow decision to wait 5 minutes after PR review request and inspect review feedback
- User workflow decision to close related issues after merge
- `AGENTS.md` Task Completion and PR Review Workflow
- GitHub issue #98
- GitHub Actions run `27017475831`
- PR #99 review threads
