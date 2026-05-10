---
id: workflow-local-development
title: Local Development Workflow
type: workflow
status: active
summary: Munjib 로컬 개발, DB, seed, test, e2e, feature start, wiki maintenance 명령.
created: 2026-04-29
updated: 2026-05-11
source_count: 9
tags:
  - munjib
  - workflow
  - development
links:
  - "[[Munjib]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Document Editing Workflow]]"
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
pnpm run db:seed
```

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

NextAuth 개발 환경에서는 안정적인 dev secret fallback이 있다. 운영 환경에서는 명시적 secret을 설정해야 한다.

## Seed와 로그인

`pnpm run db:seed`는 `company-handbook` workspace와 owner/editor/viewer seed user를 만든다. E2E 테스트는 seed 후 로그인과 workspace 문서 편집 흐름을 검증한다. `pnpm run test:e2e:ui`는 같은 seed 준비 후 Playwright UI mode를 열어 e2e 시나리오를 브라우저 UI에서 점검한다.

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

E2E는 개발 credentials login 후 workspace에 진입해 search/navigation, local graph, editor modes, tags/properties/links/comments, broken link document creation, folder-like document creation, quick switcher를 확인한다. Attachment upload와 DB-backed service tests는 local `DATABASE_URL`이 필요하다.

## Service error codes

Service layer에서 caller/test가 비교하는 error code는 `lib/service-errors.ts`의 `SERVICE_ERROR_CODES`를 우선 사용한다. Folder/document service처럼 여러 module에서 공유하는 code는 문자열 literal을 직접 던지지 않고 이 상수 object를 참조해 drift를 줄인다.

## Wiki-first lookup

작업자는 broad `rg` 전에 `wiki/index.md`를 읽거나 `pnpm wiki:find "<topic>"`을 먼저 실행한다. wiki가 비어 있거나 stale하거나 raw source verification이 필요할 때만 source search로 내려간다.

## Commit-time wiki sync

Source 변경을 커밋하기 전에는 `pnpm wiki:sync-plan --staged`를 실행해 변경 파일에 맞는 wiki 후보 page를 확인한다. durable knowledge가 생긴 경우 후보 page와 [[index|Wiki Index]], [[log|Wiki Log]]를 갱신한 뒤 `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`를 실행한다.

`wiki:sync-check --staged`는 staged source change가 있는데 staged wiki maintenance change가 없으면 실패한다. `.githooks/pre-commit`은 이 검사를 커밋마다 자동 실행하며, `pnpm wiki:install-hooks`로 현재 checkout에 연결한다.

## 근거

- `package.json`
- `.env.example`
- `prisma/seed.ts`
- `lib/wiki/sync.ts`
- `lib/wiki/feature-start.ts`
- `lib/service-errors.ts`
- `.githooks/pre-commit`
- GitHub issue #25 branch separation recovery
