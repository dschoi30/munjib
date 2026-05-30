---
id: source-project-prd
title: Project PRD
type: source
status: active
summary: Munjib 제품 방향과 현재 repository 구현을 연결하는 source note.
created: 2026-04-29
updated: 2026-05-30
source_count: 32
tags:
  - munjib
  - source
  - prd
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Folder Hierarchy Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Document Editing Workflow]]"
  - "[[Next.js Prisma Monolith]]"
---

# Project PRD

이 source note는 root의 `prd.md`, `obsidian-analysis-report.md`, 현재 애플리케이션 source를 munjib wiki의 근거로 묶는다. `raw/sources/`는 immutable source로 취급하므로 이 작업에서는 수정하지 않는다.

## 제품 방향

`prd.md`는 Obsidian의 개인 지식관리 철학을 기업용 협업 위키로 재해석한다. 핵심 방향은 다음과 같다.

- Markdown-first 문서 작성.
- `[[문서 링크]]` 중심의 연결형 지식 구조.
- Backlink, outgoing link, broken link 탐색.
- 조직/workspace/user role 기반 협업.
- 문서 version history와 audit log.
- 장기적으로 search, graph, properties, template, review flow, export를 확장.

## Obsidian 분석에서 가져온 원칙

`obsidian-analysis-report.md`는 Obsidian의 local-first, markdown, graph, backlinks, properties, search, plugin, sync/publish 같은 기능을 분석한다. Munjib은 이를 그대로 복제하지 않고 사내 문서 위키에 필요한 협업, 권한, 감사, 검색, 템플릿 관점으로 재설계한다.

## 현재 구현 현황

2026-05-05 기준 repository는 PRD의 핵심 MVP 중 다음 범위를 구현했다.

- 개발용 credentials login, seed workspace, session cookie namespace 분리.
- workspace role 기반 문서 read/write와 explicit document permission filtering.
- 문서 생성/수정/아카이브, 템플릿 기반 생성, 실제 folder 컨테이너 생성.
- Markdown editor의 edit/preview 모드, wiki link autocomplete, edit/preview 공유 heading folding state.
- `[[문서명]]` link parsing, backlink, outgoing link, broken link reconciliation.
- broken link 클릭 기반 blank document 생성과 기존 broken links repair.
- title 아래 Properties 영역: tags, links, frontmatter properties, comments.
- 좌측 navigation: folder/document tree, 검색, quick switcher, recent, localStorage favorites.
- 우측 metadata panel: tabbed attachments, versions restore, audit log, icon-only reopen control.
- attachment upload/download, 5MB 제한, 허용 MIME type, upload 시 markdown link append.
- comment 생성과 audit log.
- wiki maintenance CLI와 commit-time sync hook.

## 남은 제품 범위

아직 PRD의 다음 범위는 MVP 수준이거나 미구현이다.

- 실시간 동시 편집과 conflict resolution.
- full-text/search index service, semantic search, ranking.
- graph view의 별도 탐색 화면, filter, clustering.
- review approval workflow, comment resolve UX, notification.
- document/folder/team 단위 권한 관리 UI.
- export/publish, SSO, production deployment hardening.

## 최근 구현된 구조 변경

Issue #20은 `New folder`가 빈 document를 만들던 동작을 실제 `Folder` 컨테이너와 path 기반 document hierarchy로 바꾸었다. 구현된 설계는 duplicate title을 folder별로 허용하고, path-qualified wikilink를 지원하며, title-only ambiguous link는 임의 target으로 연결하지 않는다. Folder-specific permission과 recursive archive/restore는 첫 구현 범위에서 제외한다. 자세한 내용은 [[Folder Hierarchy Model]]과 `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`를 본다.

Issue #25는 PRD의 Markdown-first 작성 경험을 Obsidian에 더 가깝게 만들기 위해 구현된 편집 구조 변경이다. 구현 범위는 markdown heading hierarchy 기준 접기/펼치기, Preview chevron UI, Edit mode CodeMirror heading folding, 문서별 browser `localStorage` 상태 저장/복원, 기존 split mode 제거다. Edit mode는 CodeMirror folded ranges를 heading body line range와 matching해 preview와 같은 raw heading key를 저장한다. Preview rendering은 heading folding을 위해 문서를 chunk로 나누더라도 문서 전체의 reference link와 continuation line을 포함한 footnote/reference definition block을 각 chunk에 공유해 whole-document Markdown reference 해석을 보존한다.

Issue #29는 Obsidian식 작업 흐름에 더 가까운 multi-document navigation을 구현했다. 구현 범위는 상단 문서 탭, 탭 하단 back/forward toolbar, 현재 document/folder path 표시다. 이 구현은 DB schema나 markdown payload를 바꾸지 않고, 기존 server-selected single document editor와 URL query routing을 유지한다. 열린 탭 목록은 workspace-scoped browser `localStorage`에 저장하는 UI state이며, 일반 문서 선택은 현재 탭을 교체하고 tab strip `+` button 또는 sidebar Open in new tab menu만 새 탭을 만든다. Tab strip은 `+` button을 마지막 tab에 붙이고, tab이 row 폭을 채우면 각 tab width를 함께 줄인다. Forward navigation은 대상 document가 있고 해당 document가 readable할 때만 활성화한다. 여러 editor instance와 unsaved buffer 보존은 후속 범위로 둔다.

2026-05-16 metadata panel outline 설계는 PRD의 Obsidian-style 문서 탐색 경험을 오른쪽 panel로 확장하는 계획이다. `Outline` tab은 현재 선택 문서의 `#`-`####` ATX heading을 추출해 tree로 보여주고, level별 vertical guide line과 click-to-scroll navigation을 제공한다. 설계 근거는 `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`이다.

Issue #48 설계는 현재 구현된 document editor와 sidebar navigation 동작을 바꾸지 않고 큰 component 파일을 책임별 하위 모듈로 나누는 구조 리팩토링 계획이다. `DocumentEditor`와 `DocumentNavigation` export/API, route shape, localStorage key, server action contract는 유지하며, preview/folding/properties와 panel/row/tree/favorites 코드를 feature-local module로 분리한다. 설계 근거는 `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`이다.

Issue #65 설계는 graph 탐색의 링크 coverage와 filter surface를 조정하는 계획이다. Graph view는 문서 내 모든 wiki link를 graph edge 후보로 삼되 `DocumentLink` 저장 정책, Properties Links row, backlinks는 frontmatter `links:` 기준으로 유지한다. Filter surface는 wiki links를 항상 적용하고 Tags/Orphans만 사용자 토글로 남기며, property graph rendering은 제거하는 방향이다. 설계 근거는 `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`이다. Issue #67 설계는 graph zoom range 상한/하한, zoom에 따른 bounded label scaling, node 아래 label placement, sessionStorage 기반 graph option persistence, 기본 off Tags/Orphans filter, 문서 수에 따른 node size baseline을 계획한다. 설계 근거는 `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`이다.

Issue #71은 Obsidian-style tag navigation을 기존 sidebar search에 얹었다. 사용자는 `tag:#name` literal query를 직접 입력하거나 Properties frontmatter tag chip, preview body `#tag`, graph view tag node를 클릭해 exact normalized tag search를 실행한다. 검색 결과는 frontmatter tags와 body tags의 reconciled tag index를 모두 쓰지만, Properties tags row는 frontmatter-only 정책을 유지한다. 설계 근거는 `docs/superpowers/specs/2026-05-27-tag-click-search-design.md`이다.

Issue #73 설계는 document editor title row 우측에 `AI에게 묻기` 버튼을 추가하고, 저장된 문서 내용만 기반으로 답변하는 문서 중심 RAG assistant를 계획한다. Retrieval은 현재 문서, wiki link target, backlink source, same-tag 문서, workspace fallback 순서로 확장하며, 기본 chat model은 Ollama `gemma4:e4b`, embedding model은 `bge-m3`다. Embedding 저장과 similarity search는 PostgreSQL 안의 pgvector `vector(1024)`와 HNSW cosine index를 사용한다. 설계 근거는 `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`이다.

## 현재 구현 근거

현재 repository에서 확인한 구현 근거:

- `package.json`: Next.js, React, NextAuth, Prisma, Vitest, Playwright, wiki CLI.
- `prisma/schema.prisma`: organization/workspace/folder/document/link/permission/audit/tag/property/attachment/comment schema.
- `prisma/seed.ts`: company handbook seed data와 owner/editor/viewer user.
- `lib/documents/service.ts`: 문서 생성, 수정, 아카이브, version restore, broken link 생성.
- `lib/folders/service.ts`: folder 생성, rename, move, archive guard.
- `lib/workspace-tree.ts`: readable document filtering과 folder/document tree 표시 helper.
- `lib/wiki-links/parser.ts`: `[[...]]` parsing.
- `lib/wiki-links/reconcile.ts`: link row reconciliation과 repair.
- `lib/document-metadata/*`: tags와 YAML frontmatter properties extraction.
- `lib/attachments/service.ts`: attachment upload/download와 markdown link append.
- `lib/comments/service.ts`: document comment creation.
- `app/workspaces/[workspaceSlug]/page.tsx`: workspace document UI composition.
- `components/document-editor.tsx`: editor modes, properties 영역, link autocomplete, attachment/comment controls.
- `lib/markdown/folding.ts`: heading hierarchy fold tree와 stored fold key parsing.
- `components/document-navigation.tsx`: search, quick switcher, recent/favorites navigation.
- `components/folder-detail.tsx`: selected folder detail state.
- `components/metadata-panel.tsx`: local graph, attachments, versions, audit log.
- `.githooks/pre-commit`, `lib/wiki/sync.ts`: commit-time wiki sync automation.
- GitHub issue #20과 `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`: 실제 folder hierarchy 설계.
- GitHub issue #25와 `docs/superpowers/specs/2026-05-05-markdown-heading-folding-design.md`: Markdown heading folding 설계.
- GitHub issue #29와 `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`: 문서 탭과 navigation toolbar 설계.
- `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`: metadata panel outline tab 설계.
- GitHub issue #48와 `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`: document editor/navigation 구조 리팩토링 설계.
- GitHub issue #65와 `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`: knowledge graph filter/link coverage 조정 설계.
- GitHub issue #67와 `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`: knowledge graph zoom, label, session display controls 설계.
- GitHub issue #71와 `docs/superpowers/specs/2026-05-27-tag-click-search-design.md`: tag click search 설계와 구현.
- GitHub issue #73와 `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`: saved-content-only document AI RAG assistant 설계.
- `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`: heading folding과 preview reference-definition regression.
- Issue #25 final review blocker fix: edit-mode fold persistence와 multi-line definition sharing.

## Wiki 작성 원칙

이 wiki는 현재 구현과 계획을 분리한다. 구현된 기능은 현재형으로 설명하고, PRD에는 있지만 코드에 없는 기능은 roadmap 또는 planned scope로만 언급한다.
