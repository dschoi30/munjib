---
id: workflow-local-development
title: Local Development Workflow
type: workflow
status: active
summary: Munjib 로컬 개발, DB, seed, test, e2e, wiki maintenance 명령.
created: 2026-04-29
updated: 2026-04-29
source_count: 3
tags:
  - munjib
  - workflow
  - development
links:
  - "[[Munjib]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Document Editing Workflow]]"
  - "[[Wiki Schema]]"
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

`pnpm run db:seed`는 `company-handbook` workspace와 owner/editor/viewer seed user를 만든다. E2E 테스트는 seed 후 로그인과 workspace 문서 편집 흐름을 검증한다.

## Wiki-first lookup

작업자는 broad `rg` 전에 `wiki/index.md`를 읽거나 `pnpm wiki:find "<topic>"`을 먼저 실행한다. wiki가 비어 있거나 stale하거나 raw source verification이 필요할 때만 source search로 내려간다.

## 근거

- `package.json`
- `.env.example`
- `prisma/seed.ts`
