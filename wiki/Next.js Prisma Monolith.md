---
id: decision-nextjs-prisma-monolith
title: Next.js Prisma Monolith
type: decision
status: active
summary: Munjib MVP는 Next.js App Router, server actions, Prisma, PostgreSQL을 한 repository 안에서 운영한다.
created: 2026-04-29
updated: 2026-05-30
source_count: 4
tags:
  - munjib
  - architecture
  - decision
links:
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Document Knowledge Model]]"
  - "[[Local Development Workflow]]"
---

# Next.js Prisma Monolith

Munjib MVP는 Next.js App Router 기반 monolith로 시작한다. Server components와 server actions가 UI와 mutation entry point를 담당하고, Prisma가 PostgreSQL schema와 query layer를 담당한다.

## 결정

초기 구현은 별도 backend service를 두지 않고 Next.js app 안에서 다음을 함께 운영한다.

- 인증과 session helper
- workspace page rendering
- document server actions
- Prisma service function
- wiki link reconciliation
- saved-document RAG chunk indexing
- pgvector-backed RAG chunk storage/search through a local raw SQL seam
- audit logging

## 이유

MVP의 핵심 위험은 분산 시스템이 아니라 제품 흐름 검증이다. 문서 작성, link graph의 기본 데이터 모델, workspace role, version/audit flow를 빠르게 검증하려면 monolith가 단순하고 관찰하기 쉽다.

`prd.md`도 빠른 MVP에는 Next.js App Router, Server Actions/Route Handlers, Prisma, PostgreSQL을 추천하고, API 복잡도가 커지면 NestJS 같은 backend 분리를 고려하는 방향을 제시한다.

Issue #73의 RAG chunk refresh도 현재는 monolith 안에서 best-effort deferred work로 처리한다. Document create/update/move/version restore/broken-link creation과 manual attachment upload transaction이 commit된 뒤 `scheduleSavedDocumentIndex({ documentId })`가 Next.js `after()` hook에 `safeIndexSavedDocument()`를 등록한다. Indexer는 saved DB document를 다시 load하고 pgvector chunk를 교체하지만, replacement transaction이 `Document` row를 `FOR UPDATE`로 lock하고 expected `updatedAt`을 확인한 뒤 delete/insert를 수행하므로 stale job이 최신 chunk를 덮지 못한다. Indexing latency와 실패는 mutation 성공을 막지 않고 logger에만 남긴다.

pgvector integration도 별도 vector service로 분리하지 않고 PostgreSQL 안에서 시작한다. Prisma schema는 `DocumentChunk.embedding`을 `Unsupported("vector(1024)")`로 선언하고, `lib/rag/vector-store.ts`가 static raw SQL과 positional parameters로 `CAST($n AS vector(1024))` 저장/검색을 맡는다. HNSW cosine index는 Prisma Migrate drift를 피하기 위해 migration file 안의 unmanaged index가 아니라 `lib/rag/vector-index.ts`의 idempotent setup SQL과 `pnpm run db:rag:index`로 만든다. Retrieval quality tuning은 application layer의 `lib/rag/retriever.ts`에서 처리하며, default model은 config-driven `gemma4:e4b` chat과 `bge-m3` embedding이다.

## 비용

- service boundary가 커지면 server action과 domain service 사이의 책임 구분을 계속 관리해야 한다.
- 실시간 협업, search indexing, notification, attachment processing 같은 기능이 커지면 별도 worker/service가 필요할 수 있다.
- RAG embedding/indexing retry, queue durability, backfill, progress tracking이 필요해지면 현재 `after()` 기반 best-effort refresh를 durable background job으로 분리해야 한다.
- 권한 모델이 document/folder/team 단위로 확장되면 현재 workspace role helper만으로는 부족하다.

## 재검토 기준

다음 조건이 생기면 monolith 유지 여부를 다시 검토한다.

- 실시간 동시 편집이 product-critical이 된다.
- 검색이 PostgreSQL full text를 넘어 별도 search engine lifecycle을 갖는다.
- attachment processing이나 export가 background job을 요구한다.
- external API surface가 frontend 내부 server actions보다 중요해진다.
- 조직/팀/document 단위 권한이 독립 service 수준의 복잡도를 갖는다.

## 근거

- `prd.md`
- `package.json`
- `app/workspaces/[workspaceSlug]/actions.ts`
- `lib/documents/service.ts`
- `lib/attachments/service.ts`
- `lib/rag/index-document.ts`
