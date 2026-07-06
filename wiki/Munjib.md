---
id: concept-munjib
title: Munjib
type: concept
status: active
summary: Markdown-first 문서 작성과 wiki link 기반 탐색을 제공하는 Obsidian형 기업 문서 위키.
created: 2026-04-29
updated: 2026-07-07
source_count: 66
tags:
  - munjib
  - product
  - enterprise-wiki
links:
  - "[[Project PRD]]"
  - "[[Document Knowledge Model]]"
  - "[[Folder Hierarchy Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Document Editing Workflow]]"
  - "[[RAG Process Workflow]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Next.js Prisma Monolith]]"
---

# Munjib

Munjib은 Obsidian의 `[[문서 링크]]`, backlink, Markdown 중심 작성 경험을 기업용 협업 문서 위키로 재해석하는 웹 애플리케이션이다. 제품 방향은 "Notion보다 가볍고, Confluence보다 연결성이 좋고, Obsidian보다 협업과 권한에 강한 사내 지식 위키"에 가깝다.

현재 코드는 `obsidian-clone`이라는 repository 이름을 사용하지만, 인증 쿠키와 제품 문맥에서는 `munjib` 이름을 사용한다. 특히 NextAuth session cookie는 stale cookie 충돌을 피하기 위해 `munjib.session-token`으로 격리되어 있다.

## 현재 구현된 핵심

- Next.js App Router 기반 로그인과 workspace 문서 화면.
- Prisma/PostgreSQL 기반 조직, workspace, 문서, 버전, 링크, 권한, 감사 로그 모델.
- 개발용 credentials login.
- workspace role 기반 읽기/쓰기 권한 검사.
- 문서 생성, 템플릿 기반 생성, 실제 folder 컨테이너 생성, 수정, 아카이브, broken link에서 문서 생성.
- Markdown 원문과 plain text 본문 저장.
- edit/preview 모드와 Markdown preview.
- Obsidian-style heading folding, Preview chevron folding, Edit mode fold gutter, 문서별 `localStorage` fold state 복원과 edit/preview 동기화.
- 문서 수정, attachment upload, version restore 시 version row 생성.
- `[[문서명]]` wiki link 파싱과 `DocumentLink` reconciliation.
- wiki link autocomplete.
- permission-aware document search, folder/document tree navigation, quick switcher, recent/favorites navigation.
- tags와 YAML frontmatter properties extraction.
- outgoing links, backlinks, broken links, comments를 title 아래 Properties 영역에 표시.
- broken link 클릭 시 루트 경로에 blank document를 생성하고 link를 repair.
- attachments, versions, audit log를 tab으로 전환하고 닫힘 상태에서는 reopen icon만 남기는 metadata panel.
- attachment upload/download와 comment creation.
- explicit document permission이 있는 문서에 대한 read/write filtering.
- document title row의 `AI에게 묻기` assistant, 현재 저장 문서 direct-context answer, 우측 하단 workspace chatbot UI/API/RAG service, pgvector chunk index.

## Folder hierarchy

Issue #20 구현으로 `New folder`는 빈 document가 아니라 실제 `Folder` row를 만든다. `Folder`는 markdown이 없는 컨테이너이고, `Document`는 root 또는 folder path 아래 위치한 note다. 세부 결정은 [[Folder Hierarchy Model]]에 정리되어 있다.

## 아직 구현으로 과장하면 안 되는 범위

`prd.md`에는 실시간 협업, 고급 graph 탐색, review workflow, export, 조직별 세밀한 권한 관리, search indexing 같은 제품 방향이 포함되어 있다. 현재 구현은 MVP 수준의 local graph, properties, search, template, attachment, comment, version restore까지 포함하지만, 완성형 협업 지식관리 제품으로 과장하지 않는다.

Issue #119 implements workspace-level retention policy for trashed documents and a CLI/tools hard-delete purge command. The default policy is 30 days, writers can choose `Never`, `7 days`, `30 days`, or `90 days` in workspace settings, and actual hard delete targets archived documents only. Archived folder hard delete, attachment storage file cleanup, and production scheduling remain follow-up scope. 설계 근거는 `docs/superpowers/specs/2026-06-20-archived-document-retention-purge-settings-design.md`이다.

Issue #126 설계는 제품 표시 언어를 영어/한국어로 전환하는 browser-global app setting을 계획한다. Settings panel에 `Language` section을 추가해 Save 클릭 후 사용자-facing product chrome, login, document UI, settings, Ask AI/Workspace AI default messages, placeholders, thinking/error/empty states를 즉시 전환한다. 저장값이 없으면 최초 client hydration 때 `navigator.languages`/`navigator.language`의 `ko`/`ko-*` 여부로 한국어를 추론하고, 그 외는 영어로 시작한다. 현재 구현은 login, workspace sidebar/navigation, document tabs/toolbar, folder detail, metadata panel, editor/properties/preview/wiki-link suggestions, and knowledge graph controls까지 shared English/Korean catalog를 사용한다. Empty document/tab fallback labels are rendered from the current language at display time, while saved document titles, paths, provider/model ids, arbitrary frontmatter keys, and developer/admin-only error identifiers remain unlocalized data/internal strings. 실제 AI answer body는 계속 질문 언어를 우선하고, 관리자/개발자용 내부 error code/log/telemetry identifier는 번역하지 않는다. 설계 근거는 `docs/superpowers/specs/2026-06-21-product-language-internationalization-settings-design.md`이다.

Issue #147 설계는 launch workspace management를 아직 구현 전 계획으로 정리한다. Lazyweb Hypothesis #3 Account Drawer를 따르되, 상단 workspace title은 현재 workspace 이름의 유일한 큰 표시 지점으로 두고 상단 Settings-only menu는 제거한다. Workspace switch, Add workspace, Workspace settings, Log out은 하단 account/workspace drawer에서 관리하며, 하단 drawer는 `Current workspace:` 문구나 현재 workspace 이름을 반복하지 않는다. Soft archive는 `Workspace.archivedAt`로 계획하고, archived workspace는 일반 navigation과 직접 workspace page 접근에서 제외한다. 설계 근거는 `docs/superpowers/specs/2026-07-07-launch-workspace-management-design.md`이다.

## 편집 경험 개선

Issue #25 구현으로 문서 편집 화면은 split mode를 제거하고 edit/preview mode로 단순화되었다. Preview mode는 heading 왼쪽 chevron으로 section을 접고 펼치며, Edit mode는 CodeMirror heading fold gutter와 저장된 fold state 복원/저장을 제공한다. 접힘 상태는 문서별 `munjib:heading-folds:<documentId>` `localStorage` key에 저장되어 preview와 edit mode가 공유한다.

2026-05-16 승인된 metadata panel outline 설계는 오른쪽 panel 첫 번째 tab에 `Outline`을 추가하는 계획이다. Outline은 현재 선택 문서의 `#`부터 `####`까지 heading을 tree로 표시하고, `DocumentNavigation`과 같은 vertical guide line으로 heading level을 구분하며, row click으로 현재 document surface의 해당 heading으로 스크롤한다. 구현 전 설계 근거는 `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`이다.

Issue #48 설계는 `components/document-editor.tsx`와 `components/document-navigation.tsx`가 각각 약 1천 줄 규모로 커진 상태를 줄이기 위한 구조 리팩토링 계획이다. 목표는 public component API와 사용자 동작을 유지하면서 editor preview/folding/properties 하위 모듈과 navigation panel/row/tree/favorites 하위 모듈로 나누는 것이다. 구현 전 설계 근거는 `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`이다.

Issue #65 설계는 workspace knowledge graph를 Obsidian-style 탐색에 더 가깝게 다듬는 계획이다. Graph view는 Properties Links/backlinks의 frontmatter 기반 계약을 유지하면서 graph 전용으로 문서 전체 markdown의 wiki link를 볼 수 있게 하고, filter는 Tags와 Orphans 중심으로 단순화한다. 구현 전 설계 근거는 `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`이다. Issue #67 설계는 graph zoom 상한/하한, bounded label scaling, sessionStorage 기반 graph option persistence, 기본 off Tags/Orphans filter, 문서 수 기반 node size baseline을 계획한다. 설계 근거는 `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`이다.

Issue #122 구현은 workspace UI chrome state를 workspace-scoped aggregate `localStorage` key로 보존한다. 대상은 좌우 sidebar open state, 좌측 Documents/Search/Favorites active menu, knowledge graph controls panel과 Filters/Display/Forces section open state, 기존 graph filter/display/force option persistence의 `localStorage` 전환, Workspace AI chat open state다. DB, URL, server API, chat draft, pending request, graph layout position은 범위에서 제외한다. 설계 근거는 `docs/superpowers/specs/2026-06-21-workspace-ui-state-persistence-design.md`이다.

Issue #129 설계는 workspace refresh 중 좌우 sidebar가 빈 column으로 보이지 않도록 skeleton loading state를 추가하는 계획이다. 저장된 display language가 아직 hydrate되지 않았으면 sidebar와 metadata panel의 user-facing text를 숨기고 shape-only skeleton을 보여주며, language hydration 이후에는 한국어/영어로 localized된 stable chrome과 데이터 영역 shimmer skeleton을 함께 보여준다. 이 설계는 Issue #126의 초기 영어 fallback 허용을 workspace chrome에서는 더 엄격하게 바꿔, 한국어 설정 사용자가 영어 sidebar label을 먼저 보지 않게 한다. 2026-06-22 follow-up 설계는 skeleton placeholder를 실제 sidebar chrome, toolbar, section, folder row, document row, metadata toolbar/text slot에 맞추고, document row는 icon slot 없이 full-width bar로 통일하며 folder row만 실제 chevron 위치에 icon skeleton을 둔다. 해당 alignment는 `components/sidebar-loading-skeleton.tsx`와 `tests/components/sidebar-loading-skeleton.test.tsx` 구현으로 반영되었다. 설계 근거는 `docs/superpowers/specs/2026-06-21-sidebar-loading-skeleton-language-hydration-design.md`와 `docs/superpowers/specs/2026-06-22-sidebar-skeleton-alignment-design.md`이다.

Issue #71은 tag click search를 추가해 frontmatter tag chip, preview mode body `#tag`, graph view tag node를 기존 sidebar Search panel의 `tag:#name` exact search로 연결했다. 검색 결과는 YAML frontmatter `tags:`와 body `#tag`에서 reconcile된 tag index를 모두 사용하지만, Properties tags row는 계속 frontmatter-only 정책을 유지한다. 설계 근거는 `docs/superpowers/specs/2026-05-27-tag-click-search-design.md`이다.

Issue #73은 document editor title row 우측 `AI에게 묻기` button과 saved-content-only RAG assistant를 추가했다. 답변은 저장된 DB 문서 내용만 근거로 삼고, 현재 문서에서 wiki link target, backlink source, same-tag document, workspace fallback 순서로 context를 확장한다. 첫 모델 구성은 Ollama `gemma4:e4b`, `bge-m3`, PostgreSQL pgvector chunk index다. 설계 근거는 `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`이다.

Issue #100 구현으로 이 RAG assistant의 permission, saved-content, graph-aware retrieval, pgvector freshness contract는 유지하면서 chat/embedding provider boundary가 LangChain으로 이동했다. Provider 설정은 server-wide env 기반이고 Ollama, OpenAI, OpenAI-compatible endpoint를 대상으로 한다. 현재 indexed identity인 Ollama `bge-m3` 1024와 다른 embedding provider/model/dimension은 live Ask AI에서 fail-fast해 partial selected-document indexing을 만들지 않는다. Answer generation은 LangChain prompt/model/parser chain을 사용한다. Langfuse integration은 optional/fail-open이고, production 기본 metadata mode에서는 문서 본문, retrieved context, full prompt, question, answer body, unsaved draft title/markdown egress를 막기 위해 external callback을 붙이지 않는다. Explicit `full` capture에서만 LangChain invocation config에 Langfuse callback을 연결한다. 설계 근거는 `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`이다.

Issue #102 구현으로 OpenRouter를 `openai-compatible` provider env로 연결한 뒤 workspace settings panel에서 browser/workspace별 chat model id만 바꿔 Ask AI와 workspace chatbot answer generation 모델을 테스트할 수 있다. API key와 base URL은 server env에 유지하고, browser에는 model id만 `munjib:rag-chat-model:<workspaceSlug>` `localStorage` key로 저장한다. Ask route와 workspace chatbot message route는 optional `chatModel` override를 validation한 뒤 service에 전달하고, 각 service는 `chat.model`만 바꾸며 embedding provider/model/dimension과 현재 Ollama `bge-m3` 1024 index contract는 건드리지 않는다. 설계 근거는 `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`이다.

Issue #104는 Ask AI를 현재 문서 direct-context path로 전환하기 위한 context packer, Ask AI/chatbot 공통 thinking indicator, workspace chatbot 대화 이력 schema, Ask AI direct service, workspace chatbot RAG service, authenticated chatbot API routes, 우측 하단 sticky chatbot UI를 추가했다. 기존 Ask AI는 editor-local 현재 문서 assistant로 유지되며, 기본 답변 경로는 현재 저장 문서 direct context라 per-request indexing/question embedding/vector search를 호출하지 않고 chat/Langfuse generation config만 읽는다. Context packer는 heading-aware section pack뿐 아니라 heading 없는 긴 문서의 paragraph chunk fallback도 지원한다. 기존 `DocumentChunk` pgvector store는 제거하지 않고, workspace chatbot service가 사용자+workspace별 대화 이력과 함께 전역 readable document retrieval에 재사용한다. Chatbot UI는 workspace page 우측 하단 AI icon으로 열리고, active thread history load, message send, conversation reset, citations, selected document id pass-through, conversation-aware retrieval query, readable selected-document pre-cap retrieval priority, settings-panel chat model override, reset/send race guard를 제공한다. Issue #126 이후 Ask AI/chatbot labels, placeholders, generic errors, empty states, and thinking indicator elapsed-time messages는 shared English/Korean i18n catalog에서 렌더링되고, Ask AI/chatbot message requests include optional `uiLanguage` so prompt fallback/status phrasing can follow the selected display language while answer body remains question-language-first. Chatbot response streaming은 Issue #104 MVP에서 제외해 Issue #105 follow-up으로 분리한다. 설계 근거는 `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`이고, 구현 계획은 `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`에 둔다.

Ask AI RAG의 request, provider/env, indexing, retrieval, reranking, prompt, answer generation, observability 흐름은 [[RAG Process Workflow]]에서 본다.

Issue #29 구현으로 workspace center 상단에 Obsidian 참고 이미지 `wiki/designs/obsidian1.png`를 기준으로 한 문서 탭 strip과 navigation toolbar가 추가되었다. 기존 `?document=<id>` 라우팅은 active document source of truth로 유지되고, 열린 탭 목록은 workspace-scoped `munjib:open-tabs:<workspaceSlug>` `localStorage` UI state로 관리된다. 일반 문서 선택은 현재 탭을 교체하고, 마지막 tab 바로 오른쪽의 `+` button 또는 sidebar row `...` menu의 Open in new tab만 새 탭을 만든다. Tab width는 row 공간이 부족해질 때 함께 줄어든다. Toolbar는 document navigation history 기반 back/forward와 현재 document 또는 folder path 표시를 제공하며, forward 대상 document가 없거나 readable하지 않으면 forward button을 비활성화한다. Issue #131 구현은 이 path 표시와 sidebar/search/favorites/settings/folder detail path labels를 stored slug path가 아니라 folder `name`과 `Document.title` 기반 display-only path로 바꾸되, 기존 stored `Document.path`/`Folder.path`는 내부 identity와 wiki-link/RAG/graph/audit metadata 및 stored-path search compatibility로 유지한다. Issue #137 구현은 이 display-path 정책을 유지하되 일반 `Documents` sidebar tree와 recents row를 title-only로 더 조용하게 표시하고, Search/Favorites에서는 display-path context를 계속 보여준다. Top-level 새 문서/폴더 생성은 client-controlled `redirect=false` flow로 direct redirect flash를 줄이고 생성 항목으로 scroll하며, 하단 row action menu는 필요한 경우 위쪽으로 열린다.

## 빠른 진입점

- 데이터 모델은 [[Document Knowledge Model]]에서 본다.
- folder hierarchy 구현은 [[Folder Hierarchy Model]]에서 본다.
- `[[wiki link]]` 동작은 [[Wiki Links And Backlinks]]에서 본다.
- 문서 저장 흐름은 [[Document Editing Workflow]]에서 본다.
- Ask AI RAG 흐름은 [[RAG Process Workflow]]에서 본다.
- 인증과 권한은 [[Auth And Permissions Workflow]]에서 본다.
- 로컬 실행과 검증 명령은 [[Local Development Workflow]]에서 본다.

## 근거

- `prd.md`
- `obsidian-analysis-report.md`
- `package.json`
- `prisma/schema.prisma`
- `lib/documents/service.ts`
- `lib/folders/service.ts`
- `lib/workspace-tree.ts`
- `lib/wiki-links/*`
- `lib/attachments/service.ts`
- `lib/comments/service.ts`
- `lib/document-metadata/*`
- `lib/permissions/document.ts`
- `app/workspaces/[workspaceSlug]/*`
- `components/document-editor.tsx`
- `components/document-editor/ai-assistant-panel.tsx`
- `components/workspace-settings-panel.tsx`
- `lib/rag/client-model-settings.ts`
- `lib/rag/document-context.ts`
- `lib/rag/workspace-chat.ts`
- `components/document-list.tsx`
- `components/document-navigation.tsx`
- `components/folder-detail.tsx`
- `components/metadata-panel.tsx`
- `lib/rag/ask.ts`
- `lib/rag/model-config.ts`
- `lib/rag/model-factory.ts`
- `lib/rag/embedding-client.ts`
- `lib/rag/answer-chain.ts`
- `lib/rag/langfuse.ts`
- `lib/rag/errors.ts`
- `lib/rag/retriever.ts`
- `lib/rag/vector-store.ts`
- GitHub issue #20
- GitHub issue #25
- GitHub issue #29
- GitHub issue #131
- GitHub issue #137
- `docs/superpowers/specs/2026-06-27-document-list-sidebar-ux-design.md`
- `docs/superpowers/specs/2026-05-05-markdown-heading-folding-design.md`
- `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`
- `docs/superpowers/specs/2026-06-22-document-title-display-path-design.md`
- `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`
- `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`
- `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`
- `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`
- `docs/superpowers/specs/2026-05-27-tag-click-search-design.md`
- `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`
- `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`
- `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`
- `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`
- `docs/superpowers/specs/2026-06-20-archived-document-retention-purge-settings-design.md`
- GitHub issue #126
- `docs/superpowers/specs/2026-06-21-product-language-internationalization-settings-design.md`
- GitHub issue #147
- `docs/superpowers/specs/2026-07-07-launch-workspace-management-design.md`
- GitHub issue #122
- `docs/superpowers/specs/2026-06-21-workspace-ui-state-persistence-design.md`
- `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`
- GitHub issue #105
- `tests/rag/model-config.test.ts`
- `tests/rag/model-factory.test.ts`
- `tests/rag/embedding-client.test.ts`
- `tests/rag/answer-chain.test.ts`
- `tests/rag/langfuse.test.ts`
- `lib/markdown/folding.ts`
- `tests/markdown/folding.test.ts`
- `tests/components/document-editor-preview.test.tsx`
- Issue #25 final review blocker fix
