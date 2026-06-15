---
id: workflow-rag-process
title: RAG Process Workflow
type: workflow
status: active
summary: Munjib Ask AI direct-context와 workspace chatbot RAG의 saved-content-only request, retrieval, provider, observability 흐름.
created: 2026-06-13
updated: 2026-06-15
source_count: 42
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

이 page는 document editor의 `AI에게 묻기` direct-context request와 workspace chatbot의 saved DB content RAG request가 어떻게 answer와 citation으로 끝나는지 정리한다. 제품 contract는 [[Project PRD]]와 [[Munjib]]에, local/production env와 observability 세부 설정은 [[Local Development Workflow]]와 [[Production Observability Workflow]]에 둔다.

Issue #104 backend slice 이후 Ask AI의 기본 service path는 현재 저장 문서 direct-context answer다. `askDocumentQuestion()`은 selected document re-indexing, question embedding, vector search, graph-aware scope expansion, rerank를 호출하지 않고, 현재 저장 markdown을 `buildCurrentDocumentContext()`로 pack한 뒤 `buildDirectDocumentPrompt()`와 LangChain answer chain으로 답한다. 기존 `DocumentChunk` pgvector store는 제거하지 않고, `sendWorkspaceChatMessage()`가 사용자+workspace conversation history와 함께 readable workspace document retrieval에 재사용한다. Chatbot API route와 우측 하단 UI는 후속 task 범위이며, response streaming은 Issue #105 follow-up으로 분리한다.

## Process Map

이 지도는 현재 Ask AI direct path와 workspace chatbot RAG service path를 분리해서 보여준다.

```mermaid
flowchart TD
    User["User asks in editor"] --> Panel["AI assistant panel<br/>question + optional chatModel"]
    Panel --> AskRoute["Ask route<br/>parse JSON and validate input"]
    AskRoute --> AskService["askDocumentQuestion()"]
    AskService --> AskPermission["Load workspace membership<br/>and selected active document"]
    AskPermission --> AskReadable{"Selected document readable?"}
    AskReadable -- "No" --> AskNotFound["DOCUMENT_NOT_FOUND"]
    AskReadable -- "Yes" --> AskContext["buildCurrentDocumentContext()<br/>full doc or heading-aware pack"]
    AskContext --> AskPrompt["buildDirectDocumentPrompt()<br/>current document sections only"]
    AskPrompt --> AskTrace["Langfuse metadata<br/>operation rag.ask_document"]
    AskTrace --> AskAnswer["invokeAnswerChain()<br/>LangChain chat model"]
    AskAnswer --> AskUI["Answer + current-document citations"]

    ChatUser["Workspace chatbot send<br/>(API/UI task pending)"] --> ChatService["sendWorkspaceChatMessage()"]
    ChatService --> Thread["Get/create active AiChatThread<br/>P2002 retry"]
    Thread --> UserMessage["Persist USER message"]
    UserMessage --> ChatConfig["getRagModelConfig()<br/>embedding index guard"]
    ChatConfig --> ChatEmbed["embedText(current message)"]
    ChatEmbed --> ChatSearch["searchSimilarChunks()<br/>readable active document ids"]
    ChatSearch --> ChatCap["Cap prompt chunks<br/>12 total, 3 per document"]
    ChatCap --> ChatPrompt["buildRagPrompt()<br/>recent conversation + chunks"]
    ChatPrompt --> ChatAnswer["invokeAnswerChain()"]
    ChatAnswer --> ActiveCheck{"Thread still ACTIVE?"}
    ActiveCheck -- "No" --> Stale["THREAD_ARCHIVED<br/>drop stale assistant response"]
    ActiveCheck -- "Yes" --> Persist["Persist ASSISTANT<br/>citations, contextMeta, model"]
```

| Phase | Code path | Input | Output |
| --- | --- | --- | --- |
| UI request | `components/document-editor/ai-assistant-panel.tsx` | Saved document id, trimmed question, optional browser/workspace `chatModel` | Ask route payload; unsaved draft stays out of RAG |
| Route validation | `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts` | JSON body | Normalized `question`, validated optional `chatModel`, or stable 400 error |
| Ask permission gate | `askDocumentQuestion()`, `filterReadableDocuments()` | Workspace role, selected active document, explicit document permissions | Permission-safe selected document |
| Provider boundary | `getRagModelConfig()` and in-memory override | Server env plus optional `chatModel` | Effective chat model; embedding provider/model/dimension unchanged |
| Ask context packing | `buildCurrentDocumentContext()` | Selected saved markdown and question | Full saved markdown or heading-aware section subset |
| Ask prompt and citations | `buildDirectDocumentPrompt()` | Current document context | System/user prompt plus current document section citations |
| Ask answer generation | `invokeAnswerChain()` | Direct-context messages, effective chat model, optional callbacks | Answer text grounded in current saved document |
| Chat thread persistence | `getOrCreateWorkspaceChatThread()`, `sendWorkspaceChatMessage()` | Workspace/user and message | Active thread, persisted user message, persisted assistant message |
| Chat index guard | `assertCurrentEmbeddingIndex()` | Server model config | Fail-fast unless workspace retrieval index identity is Ollama `bge-m3` 1024 |
| Chat retrieval | `embedText()`, `searchSimilarChunks()` | Current message embedding, readable document ids | Candidate saved chunks from existing `DocumentChunk` rows |
| Chat prompt and citations | `buildRagPrompt()` | Recent conversation and capped chunks | Saved-context prompt plus chunk citations |
| Chat stale response guard | Prisma transaction in `sendWorkspaceChatMessage()` | Thread id and delayed answer | Assistant response is saved only if the thread is still `ACTIVE` |
| Langfuse metadata | `createLangfuseCallbackConfig()` | operation/provider/model/citation metadata | Metadata-only by default; callbacks only in explicit full mode |
| UI result | Assistant panel or future chatbot panel | Answer and citations | Rendered answer plus `[n]` citations |

Legacy/vector maintenance phases still exist for saved document indexing and future expanded-scope retrieval:

| Phase | Code path | Input | Output |
| --- | --- | --- | --- |
| Chunking | `chunkMarkdownDocument()` | Latest saved markdown | Frontmatter-stripped, heading-aware chunks with `contentHash` and token estimate |
| Chunk embedding | `indexSavedDocument()`, `embedText()` | Each saved chunk | Sequential 1024-dimension embeddings |
| Chunk store | `replaceDocumentChunks()` | Embedded chunks, source `updatedAt` | Fresh `DocumentChunk` rows; stale writes are guarded |
| Graph-aware scope building | `buildRetrievalScopes()` | Readable docs and persisted links | Current, linked, backlink, same-tag, fallback document ids for future expanded-scope flows |

## Entry points

사용자 Ask AI entry point는 `components/document-editor/ai-assistant-panel.tsx`다. Panel은 현재 문서 id와 trimmed `question`, 그리고 browser/workspace별로 저장된 optional `chatModel` override만 ask route로 보낸다. Unsaved title/content markdown이나 pending clipboard image paste payload는 request body에 넣지 않는다. 현재 editor draft가 saved DB document와 다르거나 pending paste upload가 있으면 saved-content-only warning을 표시한다.

Server entry point는 `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`다. Route는 JSON body에서 `question`과 optional `chatModel`만 읽고, malformed JSON은 missing question과 같은 `QUESTION_REQUIRED` 400으로 정규화한다. Missing 또는 `null` `chatModel`은 no override로 처리한다. String override는 shared model-id validator를 통과해야 하며 invalid override는 service 호출 전에 `INVALID_CHAT_MODEL` 400으로 중단한다. 인증 redirect는 broad service error catch 밖에서 유지하고, recoverable RAG runtime failure는 user-facing detail 없이 `AI_UNAVAILABLE` 503으로 정규화한다.

Ask AI core service는 `lib/rag/ask.ts`의 `askDocumentQuestion()`이다. 이 함수는 permission check, provider config, current-document context packing, direct prompt, LangChain answer generation, optional Langfuse metadata를 연결한다. Issue #104 backend slice 이후 Ask AI 기본 path는 selected document indexing refresh, retrieval scopes, question embedding/vector search, rerank를 호출하지 않는다.

Workspace chatbot backend service는 `lib/rag/workspace-chat.ts`다. `getOrCreateWorkspaceChatThread()`는 현재 사용자+workspace의 active thread를 만들거나 재사용하고, `sendWorkspaceChatMessage()`는 user message persistence, existing `DocumentChunk` retrieval, recent conversation prompt, answer generation, assistant message persistence를 담당한다. API route와 floating UI는 후속 task에서 이 service를 감싼다.

## Steps

Ask AI direct-context request:

1. `askDocumentQuestion()`은 question을 trim하고 빈 질문이면 `QUESTION_REQUIRED`를 던진다.
2. Workspace membership과 selected active document만 load한 뒤, workspace role과 explicit document permissions를 `filterReadableDocuments()`로 계산한다.
3. Selected document가 readable set에 없으면 `DOCUMENT_NOT_FOUND`로 중단한다.
4. `getRagModelConfig()`가 server-wide env에서 chat provider와 Langfuse config를 읽는다. Ask route가 validated `chatModel` override를 전달한 경우 service는 `chat.model`만 in-memory로 바꾸고 provider credential, base URL, embedding provider/model/dimension은 request에서 받지 않는다.
5. `buildCurrentDocumentContext()`가 selected saved markdown을 context budget에 맞게 pack한다. 문서가 budget 안에 들어가면 전체 saved markdown을 사용하고, 너무 길면 frontmatter/fenced-code heading을 고려한 heading-aware section subset을 만든다.
6. `buildDirectDocumentPrompt()`는 현재 저장 문서 context만 근거로 system/user prompt와 current-document section citation metadata를 만든다.
7. `createLangfuseCallbackConfig()`는 `rag.ask_document` operation, effective chat model, selected document id, current context partial 여부, returned citation document ids를 metadata에 담는다. Direct Ask path는 retrieval-only fields인 `retrievedChunkCount`와 `citationChunkIds`를 보내지 않는다.
8. `invokeAnswerChain()`은 literal `SystemMessage`와 `HumanMessage`를 만들어 LangChain chat model에 전달한다. Saved context나 question 안의 JSON/code braces는 template 변수로 해석되지 않는다.
9. Service는 answer와 현재 문서 section citations를 route에 반환하고, UI는 answer body와 `[n] Document Title > Heading` citation을 표시한다.

Workspace chatbot service request:

1. `sendWorkspaceChatMessage()`는 message를 trim하고 빈 메시지면 `MESSAGE_REQUIRED`를 던진다.
2. Workspace membership과 active documents를 load하고, workspace role과 explicit document permissions로 readable active document ids를 계산한다.
3. `getOrCreateActiveThread()`는 `(workspaceId, userId)`의 active thread를 재사용하거나 생성한다. Concurrent create race는 PostgreSQL partial unique index의 `P2002`를 잡고 active thread를 다시 읽어 처리한다.
4. User message를 `AiChatMessage(role=USER)`로 저장한다.
5. `getRagModelConfig()`와 `assertCurrentEmbeddingIndex()`로 현재 workspace retrieval이 Ollama `bge-m3` 1024 index identity와 맞는지 확인한다.
6. `embedText()`는 현재 user message를 embedding하고, `searchSimilarChunks()`는 readable active document ids와 current embedding model identity로 existing `DocumentChunk` rows를 검색한다.
7. Service는 prompt chunk를 최대 12개, 문서당 최대 3개로 제한한다.
8. `buildRagPrompt()`는 최근 thread message와 현재 user message를 합친 conversation question, 그리고 capped saved chunks를 근거로 prompt/citation metadata를 만든다.
9. `createLangfuseCallbackConfig()`는 `rag.workspace_chat` operation, provider/model, retrieved chunk count, citation document ids, citation chunk ids, thread/workspace/actor metadata를 만든다.
10. `invokeAnswerChain()`이 answer를 생성한 뒤, Prisma transaction 안에서 thread가 아직 `ACTIVE`인지 `updateMany({ id, status: "ACTIVE" })`로 다시 확인한다. Reset이 먼저 archive했다면 `THREAD_ARCHIVED`를 던지고 stale assistant response를 저장하지 않는다.
11. Thread가 active이면 assistant message를 `AiChatMessage(role=ASSISTANT)`로 저장하고, `citations`, `contextMeta`, `model`, `lastMessageAt`을 갱신한다.

## Provider And Index Contract

```mermaid
flowchart LR
    ServerEnv["Server env<br/>provider, base URL, API key, default models"] --> Config["getRagModelConfig()"]
    Settings["Workspace settings panel<br/>browser/workspace chat model id"] --> Request["Ask request<br/>optional chatModel"]
    Request --> Override["askDocumentQuestion()<br/>replace chat.model only"]
    Config --> Override
    Override --> Chat["Answer chat model<br/>OpenRouter or other chat provider"]
    Config --> Embedding["Embedding config<br/>provider, model, dimensions"]
    Embedding --> Guard["Current index guard<br/>Ollama bge-m3 1024"]
    Guard --> Retrieval["Chunk indexing and retrieval<br/>use fixed embedding identity"]
    ServerEnv -.-> ServerOnly["API key and base URL<br/>stay server-side"]
    ServerOnly -.-> Chat
```

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

Issue #102 이후 OpenRouter 같은 OpenAI-compatible cloud chat model 테스트는 server env에 provider/base URL/API key/default model을 둔 뒤, workspace settings panel에서 browser/workspace-scoped chat model id override를 저장하는 방식으로 한다. 이 override는 Ask AI request의 `chatModel` field로만 전달되고, server는 validated string으로 `chat.model`만 대체한다. Provider, base URL, API key, embedding provider/model/dimension은 request에서 받지 않는다.

Embedding provider/model/dimension 변경은 아직 reindex workflow와 vector dimension migration을 포함하지 않는다. Issue #104 direct Ask path는 embedding이나 vector retrieval을 사용하지 않으므로 current document answer를 embedding index guard에 묶지 않는다. Existing `DocumentChunk` indexing과 workspace chatbot retrieval은 current indexed identity인 Ollama `bge-m3` 1024가 아니면 partial or incompatible vector access를 만들지 않고 fail-fast한다.

## Retrieval And Ranking

Issue #104 direct Ask path는 retrieval scope expansion을 기본으로 사용하지 않는다. 현재 문서 질문은 selected saved markdown을 직접 pack하고, citation도 현재 문서 section만 가리킨다.

Workspace chatbot retrieval은 permission-safe readable active document ids만 사용한다. 현재 implementation은 user message embedding으로 existing `DocumentChunk` rows를 검색하고, prompt 후보를 최대 12개, 문서당 최대 3개로 제한해 한 문서가 sources를 과점하지 않게 한다. Readable하지 않은 selected document id는 Langfuse metadata와 retrieval filter에 반영하지 않는다.

Legacy graph-aware scope expansion helper는 selected current document를 우선하고, saved markdown wiki links와 persisted outgoing links를 합친 linked documents, persisted backlinks, shared normalized tags, workspace fallback 순서로 중복 없이 채운다. 이 helper는 Issue #104 direct Ask default path에서는 호출하지 않고, future explicit expanded-scope Ask AI나 retrieval tuning의 근거로 남아 있다.

Legacy reranking score는 다음 공식이다.

```text
(1 - cosine distance) + scope boost + bounded keyword overlap boost
```

Current document boost는 `0.5`, linked document `0.3`, backlink `0.25`, same-tag `0.15`다. Keyword boost는 unique term당 `0.05`, maximum `0.2`다. Token overlap은 punctuation-normalized Unicode terms를 사용하고, English stop words와 too-short Latin terms는 제외하지만 Korean/CJK 2글자 terms는 후보로 유지한다.

## Issue #104 Split

Issue #104는 기존 RAG/vector DB를 제거하지 않고 AI surface별 request profile을 분리한다. 구현된 backend 범위는 `lib/rag/document-context.ts`의 현재 문서 context packer, `components/ai/thinking-indicator.tsx`의 공통 elapsed-time indicator, `AiChatThread`/`AiChatMessage` schema, Ask AI direct-context service, workspace chatbot RAG service다.

Ask AI service는 기본 path에서 selected document re-indexing, question embedding, vector search, workspace fallback retrieval을 호출하지 않는다. 대신 현재 저장 markdown이 context budget 안에 들어가면 전체 문서를 prompt에 직접 넣고, 너무 긴 문서는 heading-aware section packer로 관련 섹션을 선택한다. Ask AI citation은 MVP에서 현재 문서 section만 가리킨다.

새 workspace chatbot은 우측 하단 sticky AI launcher와 compact chat panel을 제공하는 별도 surface다. 현재 backend service는 사용자+workspace별 active `AiChatThread`와 `AiChatMessage` history를 저장하고, PostgreSQL partial unique index가 `(workspaceId, userId)`별 `ACTIVE` thread를 하나로 제한한다. Service layer는 concurrent create race를 이 DB invariant에 맞춰 처리하고, answer generation 중 reset이 thread를 archive한 경우 stale assistant response를 저장하지 않는다. Chatbot answer turn retrieval은 기존 `DocumentChunk` rows에서 readable active document chunks를 검색한다.

Ask AI와 chatbot은 model config, chat model override validation, answer-chain invocation, Langfuse metadata, permission-safe document loading, thinking indicator UI를 공유할 수 있지만, 하나의 overloaded service function으로 합치지 않는다. 공통 Thinking indicator는 영어 elapsed-time 메시지 `Thinking...`, `Reviewing the relevant document context...`, `Organizing the evidence and drafting an answer...`, `This is taking longer than usual. Thanks for your patience...`를 순서대로 표시하고, streaming이 없는 Issue #104 MVP에서는 full response가 도착할 때까지 유지한다. Issue #105는 non-streaming chatbot contract가 안정화된 뒤 streaming answer chain, streaming route, client stream reader, partial failure policy를 다루는 별도 follow-up이다. 설계 근거는 `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`이고, 구현 계획은 `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`에 둔다.

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
- GitHub issue #102
- GitHub issue #104
- GitHub issue #105
- `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`
- `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`
- `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`
- `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`
- `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`
- `components/document-editor/ai-assistant-panel.tsx`
- `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- `lib/rag/ask.ts`
- `lib/rag/document-context.ts`
- `lib/rag/workspace-chat.ts`
- `lib/rag/client-model-settings.ts`
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
- `tests/rag/document-context.test.ts`
- `tests/rag/ask.test.ts`
- `tests/rag/ask-route.test.ts`
- `tests/rag/workspace-chat.test.ts`
- `tests/rag/model-config.test.ts`
- `tests/rag/model-factory.test.ts`
- `tests/rag/embedding-client.test.ts`
- `tests/rag/answer-chain.test.ts`
- `tests/rag/langfuse.test.ts`
- `tests/rag/langfuse-otel.test.ts`
- `tests/rag/retriever.test.ts`
- `tests/rag/vector-store.test.ts`
