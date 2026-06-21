---
id: workflow-project-structure-onboarding
title: Project Structure Onboarding
type: workflow
status: active
summary: 신규 Munjib 개발자가 첫 1시간 안에 제품 구조, repository 책임, 주요 runtime flow, 검증 명령을 파악하기 위한 진입 지도.
created: 2026-06-21
updated: 2026-06-21
source_count: 10
tags:
  - munjib
  - onboarding
  - architecture
  - development
links:
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Document Knowledge Model]]"
  - "[[Document Editing Workflow]]"
  - "[[RAG Process Workflow]]"
  - "[[Local Development Workflow]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Next.js Prisma Monolith]]"
  - "[[Wiki Maintenance Automation]]"
---

# Project Structure Onboarding

이 페이지는 Munjib repository에 처음 들어온 개발자가 broad source search 전에 읽는 첫 1시간짜리 지도다. 세부 설명을 모두 복제하지 않고, 어느 wiki page와 어느 source file에서 시작해야 하는지 연결한다.

## 첫 1시간 루트

1. 제품 모양은 [[Munjib]]에서 먼저 잡는다. Munjib은 Markdown-first 문서 작성, wiki link, graph, 권한, AI assistant를 가진 workspace wiki다.
2. 실행 방법은 [[Local Development Workflow]]에서 확인한다. `pnpm install`, DB 준비, seed, test, wiki maintenance 명령은 그 page가 source of truth다.
3. 화면 구조는 `app/workspaces/[workspaceSlug]/page.tsx`에서 시작한다. 이 server page가 workspace data를 모아 center shell, editor, navigation, graph, settings, workspace chatbot에 넘긴다.
4. 문서 저장 흐름은 `app/workspaces/[workspaceSlug]/actions.ts`에서 server action을 보고 `lib/documents/service.ts`로 내려간다.
5. AI 흐름은 두 갈래로 본다. 현재 문서 Ask AI는 `lib/rag/ask.ts`, workspace chatbot은 `lib/rag/workspace-chat.ts`에서 시작하고, 전체 흐름은 [[RAG Process Workflow]]에 있다.
6. 변경 지식은 wiki에 되돌린다. wiki 운영 규칙은 [[Wiki Maintenance Automation]]과 [[Local Development Workflow]]의 commit-time wiki sync 절차를 따른다.

## Repository Responsibility Map

```mermaid
flowchart LR
  app["app/\nApp Router pages\nroute handlers\nserver actions"]
  components["components/\nworkspace shell\neditor/navigation\ngraph/settings/AI UI"]
  lib["lib/\ndomain services\npermissions/wiki links\nRAG/observability/helpers"]
  prisma["prisma/\nschema\nmigrations\nseed data"]
  tests["tests/\nVitest/component/e2e\nworkflow coverage"]
  scripts["scripts/\nwiki CLI\nDB index setup\nmaintenance commands"]
  wiki["wiki/ + docs/\ndurable knowledge\nspecs/plans/designs"]
  raw["raw/sources/\nimmutable source evidence"]

  app --> components
  app --> lib
  lib --> prisma
  lib --> scripts
  components --> lib
  tests --> app
  tests --> components
  tests --> lib
  wiki --> raw
  docs["docs/superpowers/\napproved specs\nimplementation plans"] --> wiki
```

| Area | Read first | Responsibility |
| --- | --- | --- |
| `app/` | `app/workspaces/[workspaceSlug]/page.tsx` | Server-rendered workspace entry, API routes, route handlers, server actions. |
| `components/` | `components/app-shell.tsx`, `components/document-editor.tsx`, `components/document-navigation.tsx` | Client UI for workspace chrome, editor, navigation, graph, settings, AI panels. |
| `lib/` | `lib/documents/service.ts`, `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts` | Domain behavior, permissions, wiki links, document services, RAG, observability, utilities. |
| `prisma/` | `prisma/schema.prisma`, `prisma/seed.ts` | Runtime data model, migrations, seed workspace and users. |
| `tests/` | `tests/rag/`, `tests/components/`, `tests/documents/`, `tests/wiki/` | Focused regression coverage for domain services, UI behavior, wiki tooling. |
| `scripts/` | `scripts/wiki/*.ts`, `scripts/db/ensure-rag-vector-index.ts` | CLI wrappers for wiki maintenance, feature start, manifest/lint, DB vector index setup. |
| `wiki/` | `wiki/index.md` | Durable compiled project knowledge. Read this before broad source search. |
| `docs/superpowers/` | `docs/superpowers/specs/`, `docs/superpowers/plans/` | Approved design specs and implementation plans. |
