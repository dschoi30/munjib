---
id: index-main
title: Wiki Index
type: index
status: active
summary: Munjib repository wiki의 탐색 인덱스와 Docker 포함 local workflow navigation.
created: 2026-04-29
updated: 2026-05-30
source_count: 48
tags:
  - index
  - munjib
links:
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Document Knowledge Model]]"
  - "[[Folder Hierarchy Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Document Editing Workflow]]"
  - "[[Markdown Import And Clipboard Paste Workflow]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Local Development Workflow]]"
  - "[[Next.js Prisma Monolith]]"
  - "[[Wiki Schema]]"
  - "[[Wiki Maintenance Automation]]"
  - "[[designs/index|UI Design Excalidraw Index]]"
  - "[[log|Wiki Log]]"
---

# Wiki Index

이 페이지는 broad source search 전에 읽는 munjib repository wiki의 시작점이다. 먼저 관련 wiki page를 읽고, wiki가 비어 있거나 stale하거나 code-level verification이 필요할 때 source file search로 내려간다.

## 제품과 근거

- [[Munjib]] - Obsidian형 기업 문서 위키로서의 제품 정의와 최신 구현 범위.
- [[Project PRD]] - `prd.md`, `obsidian-analysis-report.md`, 현재 source code, 남은 roadmap을 연결한 source note.

## 핵심 개념

- [[Document Knowledge Model]] - Organization, Workspace, Document, DocumentVersion, DocumentLink, Tag, DocumentProperty, Attachment, Comment, Permission, AuditLog 모델.
- [[Folder Hierarchy Model]] - Issue #20의 실제 Folder 컨테이너, workspace tree, document path, duplicate title, ambiguous wikilink 구현.
- [[Wiki Links And Backlinks]] - `[[문서 링크]]`, alias, autocomplete, preview link rendering, backlink, broken link 저장 및 reconciliation 방식.
- [[Wiki Schema]] - wiki page frontmatter, link, manifest 유지 규칙.

## 워크플로우

- [[Document Editing Workflow]] - 문서 생성, 수정, properties, attachment, comment, version restore, 감사 로그, link/metadata reconciliation 흐름.
- [[Markdown Import And Clipboard Paste Workflow]] - Markdown file import와 editor clipboard paste의 이미지/attachment 처리, draft 저장, Save 확정 흐름.
- [[Auth And Permissions Workflow]] - NextAuth session, dev credentials, workspace role과 document-level explicit permission 흐름.
- [[Local Development Workflow]] - 로컬 실행, DB, seed, test, e2e, feature start, wiki maintenance 명령.
- [[Wiki Maintenance Automation]] - Feature Start, Ingest, Query, Lint, 커밋 전 sync plan/check 운영 방식.

## 결정

- [[Next.js Prisma Monolith]] - MVP를 Next.js App Router, server actions, Prisma, PostgreSQL monolith로 운영하는 결정.

## 디자인

- [[designs/index|UI Design Excalidraw Index]] - UI 작업이 포함된 GitHub 이슈별 Excalidraw 와이어프레임.

## 로그

- [[log|Wiki Log]] - wiki maintenance timeline.

## 상태판

- 최신 구현 현황: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]]
- 현재 편집 경험: Issue #25 heading folding 구현과 edit/preview fold state 동기화는 [[Document Editing Workflow]]와 [[Project PRD]]에 기록되어 있다. Issue #29 문서 탭과 navigation toolbar는 workspace center 상단에 구현되었으며, 기존 `?document=<id>` 라우팅과 `Document.path` path 표시를 유지한다. Issue #32 sidebar cleanup은 always-visible search form, quick switcher, template selection을 제거하고, 제목 아래 icon toolbar의 Documents/Search/Favorites panel 전환과 blank document creation으로 단순화했다. Issue #34 graph view는 sidebar Graph icon과 `?graph=1` route로 workspace knowledge graph를 열며, [[Document Editing Workflow]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]]에 UI/DTO/link semantics를 기록한다. Issue #40 workspace settings dialog는 Import menu를 기본 선택으로 열고 Markdown 파일을 workspace document로 가져온다. Issue #42 metadata panel은 Attachments/Versions/Audit log를 tab으로 전환하며, 오른쪽 panel을 닫으면 reopen icon만 남긴다. Issue #44 metadata panel outline은 첫 번째 `Outline` tab에서 현재 문서 `#`-`####` heading tree와 preview/edit click-to-scroll navigation을 제공한다. Issue #55 multiple Markdown import는 settings panel에서 여러 file 선택, table review, tree popup 기반 destination path 선택, panel-centered import status, current-route 유지 batch import를 제공한다. Issue #58 moves multiple Markdown import progress into a separate progress panel with a top progress summary, bottom file table, icon-only `X` close control, and client-side sequential per-file imports for row status updates. Issue #71 tag click search는 Properties frontmatter tag chip, preview body `#tag`, graph view tag node를 기존 sidebar Search panel의 `tag:#name` exact search로 연결한다. Markdown import와 clipboard paste의 세부 이미지/attachment 처리 차이는 [[Markdown Import And Clipboard Paste Workflow]]에 기록한다.
- 구조 리팩토링 계획: Issue #48은 `DocumentEditor`와 `DocumentNavigation`의 동작을 유지하면서 큰 component 파일을 preview/folding/properties 및 panel/row/tree/favorites module로 나누는 계획이다. 설계 근거는 `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`이다.
- Graph 후속 구현: Issue #65는 graph view의 wiki link coverage를 frontmatter-only에서 문서 전체 markdown으로 넓히고, filters를 Tags/Orphans 중심으로 단순화했다. Properties Links row와 backlinks는 계속 frontmatter `links:` 기반으로 유지한다. 설계/계획 근거는 `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`와 `docs/superpowers/plans/2026-05-25-knowledge-graph-filter-link-coverage.md`이다. Issue #67은 Tags/Orphans 기본 off filter, workspace-scoped `sessionStorage` graph option persistence, `minZoom`/`maxZoom` bounds, label font clamp, label offset, 문서 수 tier 기반 node size baseline을 구현했다. 설계 근거는 `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`이다.
- AI/RAG 구현: Issue #73은 document editor title row 우측 `AI에게 묻기` button과 saved-content-only RAG assistant를 계획한다. 현재 pgvector chunk schema, Ollama config/client wrapper, vector store helper, saved document indexing lifecycle이 구현되어 있다. Config 기본값은 chat model `gemma4:e4b`, embedding model `bge-m3`, embedding dimension `1024`, base URL `http://localhost:11434`다. Ollama client는 `/api/embed`와 non-streaming `/api/chat` request를 감싸고 recoverable RAG error code를 던지며, network/JSON failure와 embedding dimension mismatch를 저장소 진입 전에 걸러낸다. Document create/update/move/version restore/broken-link creation과 manual attachment upload는 commit 뒤 saved DB document를 다시 load하는 fire-and-forget refresh를 예약하며, stale job은 replacement transaction의 `FOR UPDATE` + expected `updatedAt` guard로 latest chunks를 덮지 못한다. Empty markdown은 기존 chunks를 clear하고 indexing failure는 save 성공을 막지 않는다. Retrieval은 현재 문서를 중심으로 wiki links, backlinks, tags, workspace fallback을 graph-aware reranking한다. 설계 근거는 `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`이다.
- 데이터/권한/링크 모델: [[Document Knowledge Model]], [[Folder Hierarchy Model]], [[Auth And Permissions Workflow]], [[Wiki Links And Backlinks]]
- wiki 운영 규칙: [[Wiki Schema]], [[Wiki Maintenance Automation]], [[Local Development Workflow]]; 신규 기능 시작은 `pnpm wiki:feature-start "<feature title>"`로 GitHub issue를 먼저 만들고, 모든 task 종료 시 draft PR을 자동 작성한 뒤 리뷰 요청 완료 5분 후 PR review/CI feedback을 다시 확인한다. Issue #50 Docker workflow는 `docker compose up --build`로 PostgreSQL과 Next.js web service를 함께 실행하고, production compose는 DB data와 web attachment storage를 named volume으로 보존하며, development override는 `docker-compose.dev.yml`을 함께 지정한다.
- 디자인 산출물: [[designs/index|UI Design Excalidraw Index]]
- stale/draft 후보: 현재 명시된 후보 없음. `pnpm wiki:lint` warning이나 semantic lint에서 발견되면 이곳에 추가한다.
