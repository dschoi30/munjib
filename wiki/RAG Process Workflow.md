---
id: workflow-rag-process
title: RAG Process Workflow
type: workflow
status: active
summary: Munjib Ask AI RAG의 saved-content-only request, indexing, retrieval, provider, observability 흐름.
created: 2026-06-13
updated: 2026-06-13
source_count: 32
tags:
  - munjib
  - workflow
  - rag
  - ai
links:
  - "[[index|Wiki Index]]"
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Document Editing Workflow]]"
  - "[[Document Knowledge Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Local Development Workflow]]"
  - "[[Production Observability Workflow]]"
---

# RAG Process Workflow

이 page는 document editor의 `AI에게 묻기`에서 시작해 saved DB content만 사용하는 Ask AI RAG request가 어떻게 answer와 citation으로 끝나는지 정리한다. 제품 contract는 [[Project PRD]]와 [[Munjib]]에, local/production env와 observability 세부 설정은 [[Local Development Workflow]]와 [[Production Observability Workflow]]에 둔다.

## Entry points

사용자 entry point는 `components/document-editor/ai-assistant-panel.tsx`다. Panel은 현재 문서 id와 trimmed `question`만 ask route로 보내고, unsaved title/content markdown이나 pending clipboard image paste payload는 request body에 넣지 않는다. 현재 editor draft가 saved DB document와 다르거나 pending paste upload가 있으면 saved-content-only warning을 표시한다.

Server entry point는 `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`다. Route는 JSON body에서 `question`만 읽고, malformed JSON은 missing question과 같은 `QUESTION_REQUIRED` 400으로 정규화한다. 인증 redirect는 broad service error catch 밖에서 유지하고, recoverable RAG runtime failure는 user-facing detail 없이 `AI_UNAVAILABLE` 503으로 정규화한다.

Core service는 `lib/rag/ask.ts`의 `askDocumentQuestion()`이다. 이 함수가 permission check, provider config, selected document indexing refresh, retrieval scopes, embedding/vector search, rerank, prompt, LangChain answer generation, optional Langfuse metadata를 연결한다.

## Steps

1. `askDocumentQuestion()`은 question을 trim하고 빈 질문이면 `QUESTION_REQUIRED`를 던진다.
2. Workspace membership과 active documents를 load한 뒤, workspace role과 explicit document permissions를 `filterReadableDocuments()`로 계산한다.
3. Selected document가 readable set에 없으면 `DOCUMENT_NOT_FOUND`로 중단한다.
4. `getRagModelConfig()`가 server-wide env에서 chat provider, embedding provider, Langfuse config를 읽는다. 현재 live Ask AI는 indexed embedding identity가 Ollama `bge-m3` 1024와 다르면 `assertCurrentEmbeddingIndex()`에서 fail-fast한다.
5. Selected saved document는 `safeIndexSavedDocument()`로 best-effort refresh한다. Save/attachment/version/broken-link 후에도 Next.js `after()` hook 기반 indexing refresh가 예약되지만, ask path는 selected document의 latest saved content를 다시 확인한다.
6. `buildRetrievalScopes()`는 selected document, saved markdown wiki link targets, persisted outgoing links, backlinks, same-tag documents, workspace fallback 순서로 readable document scopes를 만든다. Broken/ambiguous links와 unreadable documents는 scope에 들어가지 않는다.
7. Question embedding은 provider-neutral `embedText()`로 만들고, `searchSimilarChunks()`가 scoped readable document ids와 current embedding model identity로 pgvector similarity search를 실행한다.
8. `rerankRetrievedChunks()`는 vector similarity, scope boost, bounded keyword overlap boost를 합산해 prompt/citation 후보를 고른다.
9. `buildRagPrompt()`는 saved chunks만 근거로 system/user prompt와 citation metadata를 만든다. Prompt는 outside knowledge 금지, insufficient evidence response, question language matching, citation labels를 포함한다.
10. `createLangfuseCallbackConfig()`는 provider/model/chunk/citation metadata를 만들고, explicit full capture에서만 LangChain callback을 붙인다. Metadata mode에서는 raw prompt/context/question/answer body egress를 막기 위해 callback을 붙이지 않는다.
11. `invokeAnswerChain()`은 literal `SystemMessage`와 `HumanMessage`를 만들어 LangChain chat model에 전달한다. Saved context나 question 안의 JSON/code braces는 template 변수로 해석되지 않는다.
12. Service는 answer와 citations를 route에 반환하고, UI는 answer body와 `[n] Document Title > Heading` citation을 표시한다.

## Provider And Index Contract

기본 provider는 local Ollama다.

```text
MUNJIB_RAG_CHAT_PROVIDER=ollama
MUNJIB_RAG_EMBED_PROVIDER=ollama
MUNJIB_OLLAMA_BASE_URL=http://localhost:11434
MUNJIB_RAG_CHAT_MODEL=gemma4:e4b
MUNJIB_RAG_EMBED_MODEL=bge-m3
MUNJIB_RAG_EMBED_DIMENSIONS=1024
```

Issue #100 이후 chat/embedding provider boundary는 LangChain model factory가 맡는다. Official OpenAI는 `OPENAI_API_KEY` 또는 `MUNJIB_OPENAI_API_KEY`를 요구하고 optional `MUNJIB_OPENAI_BASE_URL`을 LangChain/OpenAI SDK configuration으로 전달한다. OpenAI-compatible provider는 `MUNJIB_OPENAI_COMPATIBLE_BASE_URL`을 요구하지만 API key는 local unauthenticated endpoint 지원을 위해 선택값이며, runtime factory는 non-secret placeholder key로 SDK credential preflight를 통과시킨다.

Embedding provider/model/dimension 변경은 아직 reindex workflow와 vector dimension migration을 포함하지 않는다. 그래서 current indexed identity인 Ollama `bge-m3` 1024가 아니면 live Ask AI는 partial selected-document indexing을 만들지 않고 fail-fast한다.

## Retrieval And Ranking

Retrieval scope는 permission-safe document ids만 사용한다. Scope expansion은 selected current document를 우선하고, saved markdown wiki links와 persisted outgoing links를 합친 linked documents, persisted backlinks, shared normalized tags, workspace fallback 순서로 중복 없이 채운다.

Reranking score는 다음 공식이다.

```text
(1 - cosine distance) + scope boost + bounded keyword overlap boost
```

Current document boost는 `0.5`, linked document `0.3`, backlink `0.25`, same-tag `0.15`다. Keyword boost는 unique term당 `0.05`, maximum `0.2`다. Token overlap은 punctuation-normalized Unicode terms를 사용하고, English stop words와 too-short Latin terms는 제외하지만 Korean/CJK 2글자 terms는 후보로 유지한다.

## Observability And Privacy

Sentry는 app/runtime error와 low-sample tracing 용도이며, RAG prompt/context body를 보내는 관측 계층이 아니다. Sentry privacy scrubber와 production 설정은 [[Production Observability Workflow]]에서 관리한다.

Langfuse는 optional/fail-open layer다. `LANGFUSE_PUBLIC_KEY`와 `LANGFUSE_SECRET_KEY`가 없거나 `MUNJIB_LANGFUSE_ENABLED=false`면 disabled다. Metadata mode는 기본값이고 LangChain callback이나 OpenTelemetry exporter를 붙이지 않는다. Full capture는 `MUNJIB_LANGFUSE_CAPTURE_MODE=full` 또는 legacy `MUNJIB_LANGFUSE_CAPTURE=full` 중 하나라도 설정된 경우에만 켜진다.

Full capture가 켜진 Node runtime에서는 `instrumentation.ts`가 `initializeLangfuseOtel()`을 호출하고, `lib/rag/langfuse-otel.ts`가 `@opentelemetry/sdk-node` `NodeSDK`와 `@langfuse/otel` `LangfuseSpanProcessor`를 시작한다. Answer generation에는 `@langfuse/langchain` callback이 연결된다. Startup failure, missing credentials, metadata mode, non-node runtime은 Ask AI request를 실패시키지 않는다.

## Failure Modes

Selected document가 actor에게 readable하지 않으면 `DOCUMENT_NOT_FOUND`로 처리한다. 빈 question은 `QUESTION_REQUIRED`다. Provider env가 불완전하거나 unsupported provider/dimension이면 `INVALID_CONFIG` 계열 recoverable RAG error로 이어진다.

Embedding request failure, invalid embedding shape, chat request failure, vector search/indexing failure는 stable RAG error code로 mapping된다. Answer and embedding provider catch blocks는 원본 error를 server log에 남기고, route는 user-facing response를 `AI_UNAVAILABLE`로 정규화한다.

Indexing은 saved content refresh를 best-effort로 수행한다. Empty markdown은 chunks를 clear하고, stale replacement job은 expected `updatedAt` guard로 latest chunks를 덮지 못한다. Indexing failure는 document save 자체를 실패시키지 않지만, ask request 중 selected document indexing이나 embedding/vector search failure는 answer generation 전에 중단될 수 있다.

## Tests

RAG process 변경은 최소한 관련 unit/integration tests를 함께 확인한다.

```bash
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run tests/rag/model-config.test.ts tests/rag/model-factory.test.ts tests/rag/embedding-client.test.ts tests/rag/answer-chain.test.ts tests/rag/langfuse.test.ts tests/rag/langfuse-otel.test.ts tests/rag/ask.test.ts tests/rag/ask-route.test.ts tests/rag/retriever.test.ts tests/rag/vector-store.test.ts tests/docker/compose.test.ts tests/observability/sentry-files.test.ts
DATABASE_URL='postgresql://obsidian:obsidian@localhost:55432/obsidian_clone?schema=public' pnpm test
```

Wiki maintenance는 source change와 함께 실행한다.

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

## 근거

- GitHub issue #73
- GitHub issue #100
- `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`
- `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`
- `components/document-editor/ai-assistant-panel.tsx`
- `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- `lib/rag/ask.ts`
- `lib/rag/model-config.ts`
- `lib/rag/model-factory.ts`
- `lib/rag/embedding-client.ts`
- `lib/rag/index-document.ts`
- `lib/rag/vector-store.ts`
- `lib/rag/vector-index.ts`
- `lib/rag/retriever.ts`
- `lib/rag/prompt.ts`
- `lib/rag/answer-chain.ts`
- `lib/rag/langfuse.ts`
- `lib/rag/langfuse-otel.ts`
- `lib/rag/errors.ts`
- `instrumentation.ts`
- `docker-compose.yml`
- `.env.example`
- `.env.docker.example`
- `tests/components/document-editor-preview.test.tsx`
- `tests/rag/ask.test.ts`
- `tests/rag/ask-route.test.ts`
- `tests/rag/model-config.test.ts`
- `tests/rag/model-factory.test.ts`
- `tests/rag/embedding-client.test.ts`
- `tests/rag/answer-chain.test.ts`
- `tests/rag/langfuse.test.ts`
- `tests/rag/langfuse-otel.test.ts`
- `tests/rag/retriever.test.ts`
- `tests/rag/vector-store.test.ts`
