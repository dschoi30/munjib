---
id: source-project-prd
title: Project PRD
type: source
status: active
summary: Munjib 제품 방향과 현재 repository 구현을 연결하는 source note.
created: 2026-04-29
updated: 2026-06-21
source_count: 104
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
  - "[[RAG Process Workflow]]"
  - "[[Next.js Prisma Monolith]]"
  - "[[CI CD And Monitoring Workflow]]"
  - "[[Production Observability Workflow]]"
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

Issue #92 implements the archive side of the Issue #20 recursive archive/restore follow-up. Sidebar folder `Move to trash` includes descendant folder/document counts in the confirmation and sends `cascade=true` to the server action only after user acceptance. Document counts use all active documents in the folder subtree, including explicitly permissioned documents that are not readable to the current writer but will be archived by the service. The server service recalculates the active descendant subtree under a transaction-scoped workspace folder-tree advisory lock and performs a soft-delete archive transaction. Folder/document creation, moves, renames, and folder archive take the same workspace tree lock before parent/slug/path validation so concurrent child mutations wait for cascade archive and re-check active folder state. Recursive restore and hard delete remain outside the current implementation.

Issue #119 implements the soft-deleted document hard-delete lifecycle as a workspace settings policy plus an operational CLI. Workspace-level retention policy is one of `Never`, `7 days`, `30 days`, or `90 days`, with `30 days` as the default. The settings panel `Retention` section saves the DB-backed policy, and `pnpm run documents:purge-archived` executes the hard-delete pass by `archivedAt` cutoff. The first slice deletes archived documents only; archived folder hard delete, attachment storage file cleanup, and scheduled production cadence remain follow-ups. 설계 근거는 `docs/superpowers/specs/2026-06-20-archived-document-retention-purge-settings-design.md`이다.

Issue #25는 PRD의 Markdown-first 작성 경험을 Obsidian에 더 가깝게 만들기 위해 구현된 편집 구조 변경이다. 구현 범위는 markdown heading hierarchy 기준 접기/펼치기, Preview chevron UI, Edit mode CodeMirror heading folding, 문서별 browser `localStorage` 상태 저장/복원, 기존 split mode 제거다. Edit mode는 CodeMirror folded ranges를 heading body line range와 matching해 preview와 같은 raw heading key를 저장한다. Preview rendering은 heading folding을 위해 문서를 chunk로 나누더라도 문서 전체의 reference link와 continuation line을 포함한 footnote/reference definition block을 각 chunk에 공유해 whole-document Markdown reference 해석을 보존한다.

Issue #29는 Obsidian식 작업 흐름에 더 가까운 multi-document navigation을 구현했다. 구현 범위는 상단 문서 탭, 탭 하단 back/forward toolbar, 현재 document/folder path 표시다. 이 구현은 DB schema나 markdown payload를 바꾸지 않고, 기존 server-selected single document editor와 URL query routing을 유지한다. 열린 탭 목록은 workspace-scoped browser `localStorage`에 저장하는 UI state이며, 일반 문서 선택은 현재 탭을 교체하고 tab strip `+` button 또는 sidebar Open in new tab menu만 새 탭을 만든다. Tab strip은 `+` button을 마지막 tab에 붙이고, tab이 row 폭을 채우면 각 tab width를 함께 줄인다. Forward navigation은 대상 document가 있고 해당 document가 readable할 때만 활성화한다. 여러 editor instance와 unsaved buffer 보존은 후속 범위로 둔다.

2026-05-16 metadata panel outline 설계는 PRD의 Obsidian-style 문서 탐색 경험을 오른쪽 panel로 확장하는 계획이다. `Outline` tab은 현재 선택 문서의 `#`-`####` ATX heading을 추출해 tree로 보여주고, level별 vertical guide line과 click-to-scroll navigation을 제공한다. 설계 근거는 `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`이다.

Issue #48 설계는 현재 구현된 document editor와 sidebar navigation 동작을 바꾸지 않고 큰 component 파일을 책임별 하위 모듈로 나누는 구조 리팩토링 계획이다. `DocumentEditor`와 `DocumentNavigation` export/API, route shape, localStorage key, server action contract는 유지하며, preview/folding/properties와 panel/row/tree/favorites 코드를 feature-local module로 분리한다. 설계 근거는 `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`이다.

Issue #65 설계는 graph 탐색의 링크 coverage와 filter surface를 조정하는 계획이다. Graph view는 문서 내 모든 wiki link를 graph edge 후보로 삼되 `DocumentLink` 저장 정책, Properties Links row, backlinks는 frontmatter `links:` 기준으로 유지한다. Filter surface는 wiki links를 항상 적용하고 Tags/Orphans만 사용자 토글로 남기며, property graph rendering은 제거하는 방향이다. 설계 근거는 `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`이다. Issue #67 설계는 graph zoom range 상한/하한, zoom에 따른 bounded label scaling, node 아래 label placement, sessionStorage 기반 graph option persistence, 기본 off Tags/Orphans filter, 문서 수에 따른 node size baseline을 계획한다. 설계 근거는 `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`이다.

2026-06-20 graph follow-up 설계는 기본 graph view가 실제 readable document node와 resolved document-to-document wiki edge 중심으로 보여야 한다는 contract를 정리한다. `buildKnowledgeGraph()` raw DTO가 broken/ambiguous unresolved wiki target placeholder를 만들 수 있는 것은 모델상 모순이 아니지만, default visible graph에서는 이 placeholder node와 edge를 숨기고 `Orphans`는 기존처럼 isolated document node만 제어한다. 설계 근거는 `docs/superpowers/specs/2026-06-20-knowledge-graph-hide-unresolved-targets-design.md`이다.

Issue #122 구현은 route 이동과 refresh 뒤에도 workspace UI chrome state가 유지되도록 browser/workspace-scoped aggregate `localStorage` persistence를 추가했다. `AppShell`, `DocumentList`, `KnowledgeGraphView`, `WorkspaceChatbot`은 계속 각자 상태를 소유하고, 공통 helper는 versioned key, JSON validation, safe read/write, hydration-after-mount pattern만 맡는다. 대상 상태는 좌우 sidebar open state, active sidebar panel, graph controls/section open state, graph option groups, Workspace AI chat open state다. DB schema, URL, server APIs, chat draft, pending request, graph layout position은 변경하지 않는다. 설계 근거는 `docs/superpowers/specs/2026-06-21-workspace-ui-state-persistence-design.md`이다.

Issue #71은 Obsidian-style tag navigation을 기존 sidebar search에 얹었다. 사용자는 `tag:#name` literal query를 직접 입력하거나 Properties frontmatter tag chip, preview body `#tag`, graph view tag node를 클릭해 exact normalized tag search를 실행한다. 검색 결과는 frontmatter tags와 body tags의 reconciled tag index를 모두 쓰지만, Properties tags row는 frontmatter-only 정책을 유지한다. 설계 근거는 `docs/superpowers/specs/2026-05-27-tag-click-search-design.md`이다.

Issue #73은 document editor title row 우측에 `AI에게 묻기` 버튼을 추가하고, 저장된 문서 내용만 기반으로 답변하는 문서 중심 RAG assistant를 구현했다. `AiAssistantPanel`은 ask route에 trimmed `question`만 POST하고 현재 editor draft title/contentMarkdown을 보내지 않으며, dirty title/markdown 또는 pending clipboard image paste가 있을 때 saved-content-only warning을 표시한다. Ask service는 workspace page와 같은 readable document 계산으로 selected document access를 확인한 뒤 saved document indexing, pgvector search, graph-aware reranking, prompt builder, Ollama chat을 연결한다. Retrieval은 현재 문서, wiki link target, backlink source, same-tag 문서, workspace fallback 순서로 확장하며, 기본 chat model은 Ollama `gemma4:e4b`, embedding model은 `bge-m3`다. Embedding 저장과 similarity search는 PostgreSQL 안의 pgvector `vector(1024)`와 HNSW cosine index를 사용한다. 구현은 pgvector chunk schema와 `lib/rag/config.ts`, `lib/rag/ollama.ts`를 추가해 Ollama base URL, chat model, embedding model, embedding dimension을 config-driven 기본값으로 관리하고 `/api/embed`, non-streaming `/api/chat` request를 작은 client wrapper로 감싼다. Ollama client는 offline/network failure와 invalid JSON을 recoverable request error로 정규화하고, embedding payload가 configured dimension과 finite numeric value contract를 만족하는지 검증한다. `lib/rag/vector-store.ts`는 Prisma가 직접 다루지 못하는 pgvector 저장/검색 seam을 맡고, vector literal을 raw SQL 실행 전에 검증한 뒤 static SQL과 positional parameter만 사용한다. Search SQL은 `CAST($1 AS vector(1024))`, readable document id array parameter, saved document `updatedAt`과 일치하는 stale-safe chunk filter를 유지한다. HNSW index creation은 Prisma Migrate가 unsupported vector index를 drop migration으로 되돌리려는 drift를 피하기 위해 `lib/rag/vector-index.ts`와 `pnpm run db:rag:index`의 idempotent setup step으로 분리한다. `lib/rag/index-document.ts`는 replacement transaction의 stale `false` 결과를 `indexSavedDocument()` caller까지 전파해 outdated indexing job이 성공으로 기록되지 않게 한다. `lib/rag/retriever.ts`는 saved/readable documents만 입력으로 받아 selected current document, saved markdown wiki links resolved through the shared resolver, persisted outgoing links, persisted backlinks, same normalized tags, fallback readable documents 순서로 scopes를 만든다. Reranking score는 `(1 - cosine distance) + scope boost + bounded keyword overlap boost`이며 explicit tuning weights는 current `0.5`, linked `0.3`, backlink `0.25`, same-tag `0.15`, keyword term `0.05`, keyword max `0.2`다. Reranker는 모든 scope 밖의 chunk를 prompt/citation 후보에서 제외하고, punctuation-normalized Unicode token overlap을 사용하되 English stop words와 too-short Latin terms를 무시하고 Korean/CJK 2글자 terms는 keyword boost 후보로 유지한다. 설계 근거는 `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`이고, 구현 계획은 `docs/superpowers/plans/2026-05-30-document-ai-rag-assistant.md`에 둔다.

Issue #100 구현은 Issue #73 RAG assistant의 saved-content-only product contract를 유지하면서 model/provider 운영성을 확장했다. Permission filtering, saved document indexing, graph-aware retrieval, pgvector search, rerank, citation metadata는 유지하고, prompt formatting과 chat invocation은 LangChain prompt/model/parser chain으로 옮겼다. Server-wide env는 Ollama, OpenAI, OpenAI-compatible chat/embedding provider 설정을 이해하지만, embedding provider/model/dimension은 현재 indexed identity인 Ollama `bge-m3` 1024와 다르면 live Ask AI에서 fail-fast한다. OpenAI-compatible provider의 base URL은 필수이고 API key는 local unauthenticated endpoint 지원을 위해 선택값이다. Workspace/request-level provider override, automatic reindex, vector dimension migration은 후속 범위다. Langfuse는 explicit `full` capture에서만 Node runtime OpenTelemetry exporter와 LangChain callback을 붙이고, 기본 metadata mode는 prompt/context/question/answer body가 Langfuse로 나가지 않도록 외부 callback/exporter를 붙이지 않는다. `MUNJIB_LANGFUSE_ENABLED=false`는 credential이 있어도 tracing을 끄고, legacy `MUNJIB_LANGFUSE_CAPTURE=full`은 newer capture mode 기본값에 덮이지 않도록 full-wins 해석을 쓴다. 구현은 `lib/rag/model-config.ts`, `lib/rag/model-factory.ts`, `lib/rag/embedding-client.ts`, `lib/rag/answer-chain.ts`, `lib/rag/langfuse.ts`, `lib/rag/langfuse-otel.ts`, `lib/rag/errors.ts`로 provider-neutral boundary를 나누고, `.env.example`, `.env.docker.example`, `docker-compose.yml`에 provider/Langfuse env를 문서화한다. End-to-end runtime 흐름은 [[RAG Process Workflow]]에 정리하고, 설계 근거는 `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`이다.

Issue #102 구현은 OpenRouter cloud model 테스트를 위해 server-wide `openai-compatible` provider env는 그대로 두고, workspace settings panel에서 browser/workspace별 chat model override만 선택하게 했다. Issue #109는 이를 browser/workspace별 provider+model override로 확장했다. 이 구현은 API key/base URL을 client에 노출하지 않고, DB나 Prisma schema를 추가하지 않으며, saved-content-only/direct-context answer surface와 current indexed embedding identity Ollama `bge-m3` 1024를 유지한다. Settings panel은 provider selector, static OpenRouter presets, custom model id 입력을 제공하고, `Save custom model`은 현재 provider+model pair를 localStorage override와 custom list에 저장한다. Assistant panel과 workspace chatbot은 optional `chatProvider`와 `chatModel` fields를 각 answer route로 보내며, service는 answer-generation `chat` config만 provider+model 기준으로 다시 만들고 provider credential/base URL과 embedding/index 설정은 server env 기준으로 유지한다. 설계 근거는 `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`와 GitHub issue #109이다.

2026-06-21 runtime provider switching follow-up은 settings panel에서 Ollama, official OpenAI, OpenRouter/OpenAI-compatible provider를 값 변경만으로 전환하려면 Docker web container에 세 provider의 server-side env가 모두 준비되어 있어야 한다는 운영 contract를 정리했다. `MUNJIB_RAG_CHAT_PROVIDER`와 `MUNJIB_RAG_CHAT_MODEL`은 default chat choice일 뿐 request override를 제한하지 않으며, selected provider의 base URL/API key 누락은 `RAG_INVALID_CONFIG`로 관측되어야 한다. Follow-up 구현은 handled AI 503 Sentry event에서 `RAG_INVALID_CONFIG`를 `HandledAiConfigurationError`로 구분하고, default provider가 Ollama여도 request override가 official OpenAI와 OpenRouter/OpenAI-compatible chat config를 독립적으로 만들 수 있음을 test로 고정했다. Embedding provider는 계속 chat provider와 독립적으로 유지하고, 현재 live index identity는 Ollama `bge-m3` 1024다. 설계 근거는 `docs/superpowers/specs/2026-06-21-runtime-ai-provider-switching-design.md`이다.

2026-06-21 provider model presets follow-up은 settings panel의 AI tab에서 OpenRouter/OpenAI/Ollama별 preset 목록과 provider별 reset default를 명시하고 구현했다. OpenRouter reset은 `google/gemma-4-31b-it:free`, OpenAI reset은 `gpt-5.4-mini`, Ollama reset은 `gemma:e4b`를 client override로 저장하고, custom model id 입력은 유지한다. Settings dialog는 browser viewport의 80% 높이로 고정하고 내부 content pane에서 scroll한다. 설계 근거는 `docs/superpowers/specs/2026-06-21-provider-model-presets-design.md`이다.

Issue #104는 AI assistant 경험을 두 request profile로 나누는 구현이다. 구현 범위는 current saved markdown을 budget 안에 pack하는 heading-aware/no-heading paragraph context packer, 공통 영어 thinking indicator, 사용자+workspace별 workspace chatbot thread/message persistence schema, Ask AI direct-context service, workspace chatbot RAG service, authenticated chatbot API routes, 우측 하단 floating chatbot UI다. Ask AI는 현재 문서에 대한 editor-local assistant로 유지되고, 기본 path에서는 selected document re-indexing, question embedding, vector search, workspace fallback retrieval, embedding config parsing을 호출하지 않는다. Direct context packer는 heading 없는 긴 문서뿐 아니라 budget보다 큰 headed section도 paragraph chunks로 쪼개 뒤쪽 근거를 선택할 수 있고, prompt에는 각 section content를 `[n]` label과 함께 inline으로 넣는다. 새 workspace chatbot은 기존 `DocumentChunk` pgvector store를 readable workspace document retrieval에 재사용하고, 최근 conversation context와 assistant citations/context metadata를 저장한다. Workspace chatbot은 질문과 readable documents의 lexical overlap으로 missing/stale chunks를 targeted refresh해 기존 workspace에 Welcome chunk만 있는 상태를 완화하고, selected-document referential prompt에서는 selected document도 refresh 후보에 넣으며 lexical cap 밖에서도 보존한다. Selected document chunks는 global search와 selected-document-only search를 병합한 뒤 vector distance가 top result와 충분히 가까울 때만 prompt cap 전에 우선 배치한다. Ask AI와 workspace chatbot은 answer text에 실제로 등장한 `[n]` marker만 returned citations로 노출해 prompt에 들어갔지만 답변 근거로 쓰지 않은 source를 UI에 표시하지 않는다. Workspace chatbot은 이전 assistant citation markers를 다음 prompt history에서 제거하고, answer generation 성공 transaction에서 user/assistant messages를 함께 저장해 failed turn의 orphan user message를 남기지 않으며, 동일 timestamp turn도 user-before-assistant order로 표시한다. UI는 workspace page 우측 하단 AI icon launcher와 compact chat panel로 열리며, active thread load, message send, conversation reset, Thinking indicator, selected document id pass-through, conversation-aware retrieval query, settings-panel chat model override, reset/send race guard를 제공한다. Chatbot response streaming은 Issue #104 MVP에서 제외하고 Issue #105 follow-up으로 분리한다. 설계 근거는 `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`이고, 구현 계획은 `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`에 둔다.

Issue #81은 이미 구현된 Ask AI/RAG가 현재 Docker 서버에서 정상 응답하도록 host Ollama 운영 설정을 적용했다. 서버 host에 Ollama `gemma4:e4b`와 `bge-m3`를 설치했고, Docker web container는 `MUNJIB_OLLAMA_BASE_URL=http://host.docker.internal:11434`로 host Ollama에 접근한다. `docker-compose.yml`은 Docker `host-gateway`를 `host.docker.internal`로 매핑해 Linux host gateway IP를 동적으로 해석한다. Host firewall은 compose bridge interface의 TCP 11434 inbound만 허용하고 `netfilter-persistent`에 저장했다. 설계 근거는 `docs/superpowers/specs/2026-06-03-ollama-rag-model-server-setup-design.md`이다.

Issue #88은 GitHub Actions CI/CD를 추가했다. PR과 `main` push는 pgvector PostgreSQL service, pnpm install, Prisma generate, Prisma migration deploy, RAG vector index setup, Vitest, Next build, Docker `runner` target build를 검증한다. 초기 구현은 `main` push에서 GitHub Container Registry에 `ghcr.io/dschoi30/munjib` image를 publish한 뒤 SSH로 production compose project를 갱신했지만, Issue #98 이후 현재 deploy path는 CI 성공 뒤 OCI host의 server checkout에서 workflow가 검증한 `github.sha`로 checkout을 고정하고 `docker compose build web tools`를 native ARM64로 실행한 뒤 migration/index/up/health check를 이어간다. Native build는 `NEXT_PUBLIC_SENTRY_*`와 `SENTRY_RELEASE` Docker build args를 server `.env`와 deploy release env에서 받아 browser Sentry 설정이 compiled bundle에서 빠지지 않게 한다. Production compose `web` service는 `WEB_IMAGE=munjib-web:latest`를 받고, deploy job은 exact SHA checkout, native `web`/`tools` build, tools container Prisma migration deploy, RAG vector index setup, `docker compose up -d web`, remote local health check, dangling image prune, GitHub runner public health check를 실행한다. 설계 근거는 `docs/superpowers/specs/2026-06-03-github-actions-ci-cd-design.md`와 [[CI CD And Monitoring Workflow]]이다.

Issue #89 설계는 production deployment hardening의 첫 관측성 slice다. Docker stdout은 startup, 환경 변수, DB 연결, PostgreSQL process log 확인용으로 유지하고, Sentry SaaS는 Next.js App Router error monitoring과 낮은 sample rate tracing에만 사용한다. Browser SDK 설정은 Next.js build time에 bundle되므로 `NEXT_PUBLIC_SENTRY_*` 값은 Docker build args로도 전달해야 한다. Source map upload와 `SENTRY_AUTH_TOKEN` handling은 첫 slice에서 제외한다. Sentry event scrubber는 query parameter 기반 document/search state, request URL host, request body, cookies, request headers, user IP, URL/query/address/user-agent/host span data, span description/name URL text, and breadcrumb URL/query/host fields를 제거한다. 설계 근거는 [[Production Observability Workflow]]와 `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`이고, 구현 계획은 `docs/superpowers/plans/2026-06-03-sentry-saas-observability.md`에 둔다.

Issue #94는 현재 Oracle Cloud instance의 `munjib.andrewchoi.link` production service에 기존 GitHub Actions CI/CD를 연결한다. 운영 contract는 `/home/ubuntu/munjib` compose project, Caddy `127.0.0.1:3000` reverse proxy, `sudo docker` 기반 remote deploy, `NEXTAUTH_URL=https://munjib.andrewchoi.link`, `NEXTAUTH_COOKIE_SECURE=true`, deploy 후 remote local health check와 external public HTTPS health check다. Issue #96은 OCI instance가 `linux/arm64/v8` platform으로 image를 pull한다는 post-merge deploy failure를 반영해 GHCR publish를 `linux/amd64,linux/arm64` multi-platform manifest로 바꾼 중간 fix였고, Issue #98은 follow-up main run의 long-running QEMU publish를 취소한 뒤 GHCR publish/pull을 제거하고 OCI host native build로 deploy path를 단순화했다. 초기 production 관측 기간에는 Sentry trace sample rate를 `1.0`으로 둔다. 설계 근거는 [[CI CD And Monitoring Workflow]]와 `docs/superpowers/specs/2026-06-05-oci-ci-cd-deployment-design.md`이다.

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
- `lib/rag/config.ts`, `lib/rag/model-config.ts`: provider-neutral RAG config, chat/Langfuse generation-only config, Ollama/OpenAI/OpenAI-compatible env parsing, current embedding index identity, default chat model display helper, and legacy config compatibility.
- `lib/rag/client-model-settings.ts`: browser/workspace-scoped chat model id validation, storage, and settings-change events for Ask AI and workspace chatbot model override.
- `lib/rag/model-factory.ts`: LangChain chat and embedding model factory for Ollama, OpenAI, and OpenAI-compatible endpoints.
- `lib/rag/embedding-client.ts`: provider-neutral embedding request wrapper, current-index guard, request error mapping, embedding dimension/finite-value validation.
- `lib/rag/answer-chain.ts`: LangChain prompt/model/parser chain for final answer generation.
- `lib/rag/langfuse.ts`: optional/fail-open Langfuse callback config, optional embedding metadata for direct answer paths, metadata-mode callback suppression, and metadata sanitization.
- `lib/rag/langfuse-otel.ts`: optional/fail-open Node runtime OpenTelemetry startup for full Langfuse capture.
- `lib/rag/errors.ts`: provider-neutral recoverable RAG runtime error codes.
- `lib/rag/vector-store.ts`: pgvector `DocumentChunk` replacement and similarity search helpers using static raw SQL, `CAST($n AS vector(1024))`, stale chunk filtering, and bound vector/readable-document parameters.
- `lib/rag/vector-index.ts`: idempotent HNSW cosine index setup SQL kept outside Prisma migration history.
- `lib/rag/retriever.ts`: graph-aware retrieval scopes and deterministic reranking for saved/readable documents.
- `lib/rag/document-context.ts`: current saved markdown context packer for direct Ask AI, including frontmatter stripping, heading-aware section packing, no-heading and oversized-heading paragraph chunk fallback, labeled context blocks, and partial-context metadata.
- `lib/rag/prompt.ts`: saved chunk RAG prompt plus current-document direct prompt, insufficient evidence instruction, question language matching, inline citation labels, and answer-referenced citation filtering.
- `lib/rag/ask.ts`: current-document direct Ask AI service with readable selected document filtering, chat model override, generation-only config, direct prompt, LangChain chat, answer-referenced citations, and optional Langfuse invocation metadata.
- `lib/rag/workspace-chat.ts`: workspace chatbot backend service with active thread reuse, successful-turn user/assistant message persistence, targeted missing/stale `DocumentChunk` backfill including selected-document referential prompts, global plus selected-document-only readable chunk retrieval, conversation-aware retrieval query, distance-gated selected-document pre-cap priority, optional chat model override, recent conversation prompt, answer-referenced citations, reset/archive handling, and stale-response guard.
- `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`: route handler that accepts `question` plus optional validated `chatModel` from JSON body and maps service errors to JSON responses.
- `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route.ts`: workspace chatbot thread load, message send, optional validated `chatModel` override, reset/archive API routes with shared stable error mapping.
- `app/workspaces/[workspaceSlug]/page.tsx`: workspace document UI composition.
- `components/document-editor.tsx`: editor modes, properties 영역, link autocomplete, attachment/comment controls.
- `components/workspace-settings-panel.tsx`: workspace settings dialog that includes Markdown import and AI chat model override controls.
- `docs/superpowers/specs/2026-06-20-archived-document-retention-purge-settings-design.md`: Issue #119 retention settings and archived document purge design.
- `components/document-editor/ai-assistant-panel.tsx`: title-row assistant panel that posts trimmed questions plus optional browser model override and renders answer/citations/error state.
- `components/workspace-chatbot.tsx`: fixed bottom-right workspace AI launcher and compact chat panel with thread loading, message sending, stored chat model override, reset, Thinking indicator, citations, and stale response guards.
- `lib/markdown/folding.ts`: heading hierarchy fold tree와 stored fold key parsing.
- `components/document-navigation.tsx`: search, quick switcher, recent/favorites navigation.
- `components/folder-detail.tsx`: selected folder detail state.
- `components/metadata-panel.tsx`: local graph, attachments, versions, audit log.
- `.githooks/pre-commit`, `lib/wiki/sync.ts`: commit-time wiki sync automation.
- GitHub issue #20과 `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`: 실제 folder hierarchy 설계.
- GitHub issue #92와 `docs/superpowers/specs/2026-06-05-cascade-folder-trash-confirmation-design.md`: 사용자 확인 기반 cascade folder archive 설계.
- GitHub issue #25와 `docs/superpowers/specs/2026-05-05-markdown-heading-folding-design.md`: Markdown heading folding 설계.
- GitHub issue #29와 `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`: 문서 탭과 navigation toolbar 설계.
- `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`: metadata panel outline tab 설계.
- GitHub issue #48와 `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`: document editor/navigation 구조 리팩토링 설계.
- GitHub issue #65와 `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`: knowledge graph filter/link coverage 조정 설계.
- GitHub issue #67와 `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`: knowledge graph zoom, label, session display controls 설계.
- GitHub issue #122와 `docs/superpowers/specs/2026-06-21-workspace-ui-state-persistence-design.md`: workspace UI chrome state persistence 설계와 구현 범위.
- GitHub issue #71와 `docs/superpowers/specs/2026-05-27-tag-click-search-design.md`: tag click search 설계와 구현.
- GitHub issue #73와 `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`: saved-content-only document AI RAG assistant 설계.
- GitHub issue #100와 `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`: LangChain provider abstraction과 Langfuse RAG observability 설계.
- GitHub issue #102, GitHub issue #109, `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`: OpenRouter provider/model selection 설계와 구현.
- `docs/superpowers/specs/2026-06-21-provider-model-presets-design.md`: settings panel의 provider별 model presets, reset defaults, custom model input 유지, 80vh dialog sizing 설계.
- GitHub issue #104와 `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`: Ask AI direct-context 전환과 workspace chatbot 설계.
- `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`: Issue #104 구현 계획.
- GitHub issue #105: chatbot response streaming follow-up.
- GitHub issue #88와 `docs/superpowers/specs/2026-06-03-github-actions-ci-cd-design.md`: GitHub Actions CI/CD 설계.
- `docs/superpowers/plans/2026-05-30-document-ai-rag-assistant.md`: pgvector, Ollama, retriever, UI, wiki/PR workflow 구현 계획.
- GitHub issue #89, `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`, `docs/superpowers/plans/2026-06-03-sentry-saas-observability.md`: production Docker 로그와 Sentry SaaS error/tracing 역할 분리 설계 및 구현 계획.
- GitHub issue #94와 `docs/superpowers/specs/2026-06-05-oci-ci-cd-deployment-design.md`: Oracle Cloud instance의 `munjib.andrewchoi.link` production service에 GitHub Actions CI/CD를 연결하는 설계.
- GitHub issue #96와 GitHub Actions run `27016407598`: OCI ARM64 instance가 amd64-only GHCR image를 pull하지 못한 deploy failure와 multi-platform publish 중간 fix.
- GitHub issue #98와 GitHub Actions run `27017475831`: QEMU 기반 multi-platform publish가 장시간 지연되어 취소된 뒤 OCI host native build deploy로 바꾼 follow-up.
- PR #99 review threads: OCI native build deploy를 exact GitHub SHA에 pinning하고, remote local health check, public runner health check, dangling image prune을 추가한 review follow-up.
- `tests/rag/client-model-settings.test.ts`, `tests/rag/model-config.test.ts`, `tests/rag/model-factory.test.ts`, `tests/rag/embedding-client.test.ts`, `tests/rag/answer-chain.test.ts`, `tests/rag/langfuse.test.ts`, `tests/rag/langfuse-otel.test.ts`: browser model setting validation/storage, provider-neutral RAG config, generation-only config, LangChain model factory, embedding client, answer chain, optional Langfuse embedding metadata, and Langfuse OpenTelemetry startup coverage.
- `tests/rag/vector-store.test.ts`: vector literal validation, static pgvector SQL cast syntax, stale-safe search SQL, replacement metadata validation, and bound-parameter coverage.
- `tests/rag/vector-index.test.ts`: Prisma migrate-dev-safe HNSW index setup SQL and migration-history guard coverage.
- `tests/rag/retriever.test.ts`: current/wiki/backlink/tag/fallback scope coverage, path-qualified resolver coverage, duplicate scope suppression, and bounded keyword boost coverage.
- `tests/rag/document-context.test.ts`, `tests/rag/prompt.test.ts`, `tests/rag/ask.test.ts`, `tests/rag/ask-route.test.ts`, `tests/rag/workspace-chat.test.ts`, `tests/rag/workspace-chat-route.test.ts`: current-document packing, no-heading and oversized-heading paragraph fallback, saved/context prompt builders, answer-referenced citation filtering, Ask AI direct service permission/input/config contract, route error mapping, selected-document retrieval priority, targeted chatbot index backfill, selected-document-only retrieval merge, conversation-aware chatbot retrieval, chat model override validation/service coverage, and workspace chatbot persistence/retrieval/reset/API coverage.
- `tests/components/workspace-chatbot.test.tsx`: workspace chatbot launcher/panel, thread loading, send/citation rendering, settings-panel model override request body, reset, close, workspace-change isolation, delayed response guards, reset-pending disabled state, and recoverable load/send/reset error coverage.
- `tests/components/document-list.test.tsx`, `tests/components/document-editor-preview.test.tsx`: settings AI tab model override, assistant button/panel, question plus optional chat model POST, saved-content warning, pending paste warning, and document-switch state reset coverage.
- `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`: heading folding과 preview reference-definition regression.
- Issue #25 final review blocker fix: edit-mode fold persistence와 multi-line definition sharing.

## Wiki 작성 원칙

이 wiki는 현재 구현과 계획을 분리한다. 구현된 기능은 현재형으로 설명하고, PRD에는 있지만 코드에 없는 기능은 roadmap 또는 planned scope로만 언급한다.
