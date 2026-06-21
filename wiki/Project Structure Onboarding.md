---
id: workflow-project-structure-onboarding
title: Project Structure Onboarding
type: workflow
status: active
summary: 신규 Munjib 개발자가 첫 1시간 안에 제품 구조, repository 책임, 주요 runtime flow, 검증 명령을 파악하기 위한 진입 지도.
created: 2026-06-21
updated: 2026-06-21
source_count: 21
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

## Core Runtime Flow

Munjib MVP는 [[Next.js Prisma Monolith]] 결정에 따라 한 repository 안에서 UI, route/server action, domain service, Prisma/PostgreSQL을 함께 운영한다.

```mermaid
flowchart TD
  UI["UI component\ncomponents/*"]
  Route["Route handler or server action\napp/workspaces/* + app/api/workspaces/*"]
  Service["Domain service\nlib/*/service.ts or lib/rag/*"]
  DB["Prisma/PostgreSQL\nprisma/schema.prisma"]
  LinkTagData["Link/tag graph data\nDocumentLink\nDocumentTag"]
  RagIndex["RAG index\nDocumentChunk"]
  AI["AI provider boundary\nLangChain/Ollama/OpenAI/OpenAI-compatible"]

  UI --> Route
  Route --> Service
  Service --> DB
  Service --> LinkTagData
  Service --> RagIndex
  Service --> AI

  Doc["Document edit/save"] --> Route
  Doc --> Service
  Graph["Graph view"] --> Route
  Graph --> LinkTagData
  Ask["Ask AI"] --> Service
  Ask --> AI
  Chat["Workspace AI"] --> Service
  Chat --> RagIndex
  Chat --> AI
```

### Flow starting points

| Flow | Start here | Then read | Deep wiki page |
| --- | --- | --- | --- |
| Workspace screen | `app/workspaces/[workspaceSlug]/page.tsx` | `components/app-shell.tsx`, `components/workspace-center-shell.tsx` | [[Document Editing Workflow]] |
| Document save | `app/workspaces/[workspaceSlug]/actions.ts` | `lib/documents/service.ts`, `lib/wiki-links/reconcile.ts`, `lib/document-metadata/reconcile.ts` | [[Document Editing Workflow]] |
| Graph view | `components/knowledge-graph-view.tsx` | `lib/knowledge-graph/model.ts`, `lib/workspace-routes.ts` | [[Document Knowledge Model]] |
| Ask AI | `components/document-editor/ai-assistant-panel.tsx` | `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `lib/rag/ask.ts` | [[RAG Process Workflow]] |
| Workspace AI | `components/workspace-chatbot.tsx` | `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `lib/rag/workspace-chat.ts` | [[RAG Process Workflow]] |

## Data And Knowledge Source Of Truth

| Layer | Source of truth | Notes |
| --- | --- | --- |
| Product/runtime data | `prisma/schema.prisma` and PostgreSQL | User, organization, workspace, folder, document, permission, version, audit, attachment metadata, comment, AI chat, and retention data live here. |
| Attachment file bytes | `storage/attachments/` | Uploaded file bytes live on disk while attachment metadata lives in PostgreSQL. |
| Saved document content | `Document.contentMarkdown` and `Document.contentText` | Saved DB content drives preview, wiki-link parsing, metadata extraction, graph construction, and RAG indexing. Unsaved editor draft is not the source for Ask AI answers. |
| Link/tag support data | `DocumentLink`, `DocumentTag` | These rows support backlinks, tags, and graph DTOs. They are derived from saved documents and reconciliation flows. |
| RAG index support data | `DocumentChunk` | These rows support workspace chatbot retrieval and future/legacy expanded-scope retrieval. They are refreshed from saved documents, but the current Ask AI direct-context path reads saved document content directly instead of querying `DocumentChunk`. |
| Project knowledge | `wiki/*.md` | Wiki pages are durable compiled knowledge. Start from `wiki/index.md` or `pnpm wiki:find "<topic>"` before broad source search. |
| Design and implementation intent | `docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md` | Specs and plans explain why a change exists and how it should be implemented. |
| Immutable evidence | `raw/sources/` | Do not edit these files during wiki maintenance. |

## Feature-To-Files Guide

| Question | Start reading | Supporting files | Tests |
| --- | --- | --- | --- |
| How does the workspace screen load? | `app/workspaces/[workspaceSlug]/page.tsx` | `components/app-shell.tsx`, `components/workspace-center-shell.tsx`, `lib/workspace-tree.ts` | `tests/components/app-shell.test.tsx`, `tests/workspace-tree.test.ts` |
| How are documents created, updated, archived, and restored? | `app/workspaces/[workspaceSlug]/actions.ts` | `lib/documents/service.ts`, `lib/service-errors.ts` | `tests/documents/service.test.ts`, `tests/workspace-actions.test.ts` |
| How does folder navigation work? | `components/document-navigation.tsx` | `components/document-navigation/tree.ts`, `lib/folders/service.ts`, `lib/folders/path.ts` | `tests/folders/service.test.ts`, `tests/folders/path.test.ts` |
| How do Markdown preview, properties, and folding work? | `components/document-editor.tsx` | `components/document-editor/markdown-preview.tsx`, `components/document-editor/document-properties.tsx`, `lib/markdown/folding.ts` | `tests/components/document-editor-preview.test.tsx`, `tests/markdown/folding.test.ts` |
| How do wiki links and backlinks get reconciled? | `lib/wiki-links/reconcile.ts` | `lib/wiki-links/parser.ts`, `lib/wiki-links/resolve.ts`, `lib/wiki-links/preview.ts`, `lib/wiki-links/service.ts` | `tests/wiki-links/reconcile.test.ts`, `tests/wiki-links/parser.test.ts`, `tests/wiki-links/preview.test.ts` |
| How do document metadata and tags get reconciled? | `lib/document-metadata/reconcile.ts` | `lib/document-metadata/parser.ts`, `lib/documents/service.ts` | `tests/document-metadata/parser.test.ts`, `tests/documents/service.test.ts` |
| How does graph view data and routing work? | `lib/knowledge-graph/model.ts` | `app/workspaces/[workspaceSlug]/page.tsx`, `components/knowledge-graph-view.tsx`, `lib/workspace-routes.ts` | `tests/knowledge-graph/model.test.ts`, `tests/components/knowledge-graph-view.test.tsx` |
| How are auth and permissions enforced? | `lib/auth/session.ts` | `lib/permissions/workspace.ts`, `lib/permissions/document.ts`, `lib/auth/config.ts` | `tests/auth/config.test.ts`, `tests/permissions/document.test.ts`, `tests/permissions/workspace.test.ts` |
| How does current-document Ask AI work? | `components/document-editor/ai-assistant-panel.tsx` | `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `lib/rag/ask.ts`, `lib/rag/document-context.ts` | `tests/rag/ask.test.ts`, `tests/rag/ask-route.test.ts`, `tests/rag/document-context.test.ts` |
| How does Workspace AI chat work? | `components/workspace-chatbot.tsx` | `components/workspace-chatbot-stream.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `lib/rag/workspace-chat.ts` | `tests/components/workspace-chatbot.test.tsx`, `tests/rag/workspace-chat.test.ts`, `tests/rag/workspace-chat-route.test.ts` |
| How do outline, attachments, versions, and audit logs connect? | `components/metadata-panel.tsx` | `lib/attachments/service.ts`, `lib/documents/service.ts`, `lib/audit/log.ts` | `tests/components/metadata-panel.test.tsx`, `tests/attachments/service.test.ts`, `tests/documents/service.test.ts` |
| How do comments and document properties work? | `components/document-editor/document-properties.tsx` | `app/workspaces/[workspaceSlug]/actions.ts`, `lib/comments/service.ts` | `tests/comments/service.test.ts`, `tests/workspace-actions.test.ts` |
| How does archived document retention work? | `components/workspace-settings-panel.tsx` | `lib/workspaces/retention-service.ts`, `lib/documents/purge-archived.ts`, `scripts/documents/purge-archived.ts` | `tests/workspaces/retention-service.test.ts`, `tests/documents/purge-archived.test.ts`, `tests/documents/purge-archived-cli.test.ts` |
| How does wiki maintenance work? | `wiki/index.md` | `scripts/wiki/find.ts`, `scripts/wiki/sync-plan.ts`, `scripts/wiki/sync-check.ts`, `lib/wiki/sync.ts`, `.githooks/pre-commit` | `tests/wiki/sync.test.ts`, `tests/wiki/search.test.ts`, `tests/wiki/lint.test.ts` |

## Verification And Wiki Maintenance

Before changing source code, create or confirm a GitHub issue with:

```bash
pnpm wiki:feature-start "<feature title>"
```

Before broad source search, start with:

```bash
pnpm wiki:find "<topic>"
```

For documentation-only changes, run the manifest before final staging because it may rewrite `wiki/manifest.json`:

```bash
pnpm wiki:manifest
```

Then stage the changed docs/wiki files and the regenerated manifest if it changed before running:

```bash
pnpm wiki:sync-plan --staged
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --check --cached
```

For source changes, run the focused test for the touched surface and typecheck first. Examples:

```bash
pnpm exec vitest run tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts
pnpm exec vitest run tests/documents/service.test.ts tests/wiki-links/reconcile.test.ts
pnpm exec tsc --noEmit --pretty false
```

Then run the manifest before final staging because it may rewrite `wiki/manifest.json`:

```bash
pnpm wiki:manifest
```

Stage the source and wiki maintenance files plus `wiki/manifest.json` if it changed, then run the same staged wiki sync bundle:

```bash
pnpm wiki:sync-plan --staged
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --check --cached
```

## 근거

- GitHub issue #123
- `docs/superpowers/specs/2026-06-21-project-structure-onboarding-design.md`
- `wiki/index.md`
- `wiki/Munjib.md`
- `wiki/Document Knowledge Model.md`
- `wiki/Document Editing Workflow.md`
- `wiki/RAG Process Workflow.md`
- `wiki/Local Development Workflow.md`
- `app/workspaces/[workspaceSlug]/page.tsx`
- `app/workspaces/[workspaceSlug]/actions.ts`
- `components/app-shell.tsx`
- `components/document-editor.tsx`
- `components/document-navigation.tsx`
- `components/knowledge-graph-view.tsx`
- `components/workspace-chatbot.tsx`
- `lib/documents/service.ts`
- `lib/knowledge-graph/model.ts`
- `lib/rag/ask.ts`
- `lib/rag/workspace-chat.ts`
- `prisma/schema.prisma`
- `package.json`
