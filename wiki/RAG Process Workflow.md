---
id: workflow-rag-process
title: RAG Process Workflow
type: workflow
status: active
summary: Munjib Ask AI direct-context와 workspace chatbot RAG의 saved-content-only request, retrieval, provider, observability 흐름.
created: 2026-06-13
updated: 2026-07-07
source_count: 115
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

Issue #104 구현 이후 Ask AI의 기본 service path는 현재 저장 문서 direct-context answer다. `askDocumentQuestion()`은 selected document re-indexing, question embedding, vector search, graph-aware scope expansion, rerank를 호출하지 않고, 현재 저장 markdown을 `buildCurrentDocumentContext()`로 pack한 뒤 `buildDirectDocumentPrompt()`와 LangChain answer chain으로 답한다. Direct Ask는 chat/Langfuse generation config만 읽으므로 embedding provider/model/dimension env가 invalid여도 현재 문서 답변 자체를 막지 않는다. 기존 `DocumentChunk` pgvector store는 제거하지 않고, workspace chatbot이 사용자+workspace conversation history와 함께 readable workspace document retrieval에 재사용한다. Chatbot은 authenticated API route와 우측 하단 floating UI로 `getOrCreateWorkspaceChatThread()`, streaming `/assistant/messages`, `resetWorkspaceChatThread()`를 감싼다. Issue #105는 answer-chain token streaming, workspace-chat service preparation/finalization seam, `/assistant/messages` NDJSON route events, and React client stream rendering을 추가했다.

## Process Map

이 지도는 현재 Ask AI direct path와 workspace chatbot RAG service path를 분리해서 보여준다.

```mermaid
flowchart TD
    User["User asks in editor"] --> Panel["AI assistant panel<br/>question + optional provider/model"]
    Panel --> AskRoute["Ask route<br/>parse JSON and validate input"]
    AskRoute --> AskService["askDocumentQuestion()"]
    AskService --> AskPermission["Load active workspace membership<br/>and selected active document"]
    AskPermission --> AskReadable{"Selected document readable?"}
    AskReadable -- "No" --> AskNotFound["DOCUMENT_NOT_FOUND"]
    AskReadable -- "Yes" --> AskContext["buildCurrentDocumentContext()<br/>full doc, heading-aware pack,<br/>or no-heading paragraph chunks"]
    AskContext --> AskPrompt["buildDirectDocumentPrompt()<br/>current document sections only"]
    AskPrompt --> AskTrace["Langfuse metadata<br/>operation rag.ask_document"]
    AskTrace --> AskAnswer["invokeAnswerChain()<br/>LangChain chat model"]
    AskAnswer --> AskNormalize["normalizeAnswerCitations()<br/>used sources renumbered 1..n"]
    AskNormalize --> AskUI["Markdown answer + clickable current-document citations"]

    ChatUser["Workspace chatbot panel<br/>message + selectedDocumentId"] --> ChatRoute["Assistant routes<br/>thread, messages, reset"]
    ChatRoute --> ChatService["sendWorkspaceChatMessage()"]
    ChatService --> Thread["Get/create active AiChatThread<br/>P2002 retry"]
    Thread --> ChatConfig["getRagModelConfig()<br/>embedding index guard"]
    ChatConfig --> ChatMemory["Refresh thread memory summary<br/>when recent history exceeds budget"]
    ChatMemory --> ChatBackfill["ensureWorkspaceChatRetrievalIndex()<br/>targeted missing/stale chunk backfill"]
    ChatBackfill --> ChatEmbed["embedText(memory-aware query)"]
    ChatEmbed --> ChatSearch["searchSimilarChunks()<br/>readable active document ids"]
    ChatSearch --> ChatCap["Cap prompt chunks<br/>12 total, 3 per document"]
    ChatCap --> ChatPrompt["buildRagPrompt()<br/>recent conversation + chunks"]
    ChatPrompt --> ChatAnswer["invokeAnswerChain()<br/>or streamAnswerChain()"]
    ChatAnswer --> UsedCitations["normalizeAnswerCitations()<br/>keep and renumber answer-referenced sources"]
    UsedCitations --> ActiveCheck{"Thread still ACTIVE?"}
    ActiveCheck -- "No" --> Stale["THREAD_ARCHIVED<br/>drop stale assistant response"]
    ActiveCheck -- "Yes" --> Persist["Persist USER + ASSISTANT<br/>citations, contextMeta, model"]
```

| Phase | Code path | Input | Output |
| --- | --- | --- | --- |
| UI request | `components/document-editor/ai-assistant-panel.tsx` | Saved document id, trimmed question, optional browser/workspace `chatModel` | Ask route payload; unsaved draft stays out of RAG |
| Route validation | `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts` | JSON body | Normalized `question`, validated optional provider+model pair, or stable 400 error |
| Ask permission gate | `askDocumentQuestion()`, `filterReadableDocuments()` | Active workspace membership, selected active document, explicit document permissions | Permission-safe selected document |
| Provider boundary | `getRagGenerationConfig()`, `getRagModelConfig()`, and provider/model override | Server env plus optional `chatProvider` + `chatModel` | Effective chat provider/model; complete provider overrides do not require the default provider config; Ask direct path does not validate embedding env; chatbot retrieval keeps embedding provider/model/dimension unchanged |
| Ask context packing | `buildCurrentDocumentContext()` | Selected saved markdown and question | Full saved markdown, heading-aware section subset, no-heading paragraph chunk subset, or oversized-heading paragraph chunk subset with inline citation labels |
| Ask prompt and citations | `buildDirectDocumentPrompt()`, `normalizeAnswerCitations()` | Current document context and answer text | System/user prompt plus answer-referenced current document section citations renumbered by answer appearance |
| Ask answer generation | `invokeAnswerChain()` | Direct-context messages, effective chat model, optional callbacks | Answer text grounded in current saved document |
| Chatbot UI | `components/workspace-chatbot.tsx`, `app/workspaces/[workspaceSlug]/page.tsx` | Workspace slug, selected document id, active thread state, optional browser/workspace `chatModel` | Fixed bottom-right launcher, compact panel, thread history, send/reset controls |
| Chat route validation | `app/api/workspaces/[workspaceSlug]/assistant/*/route.ts` | Authenticated request and JSON body | Thread load, validated optional provider+model pair, JSON validation errors, NDJSON message send stream, reset/archive responses with stable error mapping |
| Chat thread persistence | `getOrCreateWorkspaceChatThread()`, `sendWorkspaceChatMessage()` | Workspace/user and successful answer turn | Active thread, display-ordered history, rolling memory summary, persisted user+assistant messages |
| Chat index guard | `assertCurrentEmbeddingIndex()` | Server model config | Fail-fast unless workspace retrieval index identity is Ollama `bge-m3` 1024 |
| Chat targeted index backfill | `ensureWorkspaceChatRetrievalIndex()`, `safeIndexSavedDocument()` | Memory-aware conversation query, readable active documents, current embedding model | Missing/stale chunks for lexically relevant readable documents are refreshed before vector search |
| Chat retrieval | `embedText()`, `searchSimilarChunks()` | Memory-aware conversation query embedding, readable document ids | Candidate saved chunks from current `DocumentChunk` rows |
| Chat prompt and citations | `buildRagPrompt()`, `normalizeAnswerCitations()` | Thread memory summary, recent conversation, capped chunks, and answer text | Saved-context prompt plus answer-referenced chunk citations renumbered by answer appearance |
| Chat stale response guard | Prisma transaction in `sendWorkspaceChatMessage()` | Thread id and delayed answer | Assistant response is saved only if the thread is still `ACTIVE` |
| Langfuse metadata | `createLangfuseCallbackConfig()` | operation/provider/model/citation metadata | Metadata-only by default; callbacks only in explicit full mode |
| UI result | Assistant panel or chatbot panel | Answer and filtered citations | Markdown-rendered answer plus clickable `[n]` citations used by the answer |

Legacy/vector maintenance phases still exist for saved document indexing and future expanded-scope retrieval:

| Phase | Code path | Input | Output |
| --- | --- | --- | --- |
| Chunking | `chunkMarkdownDocument()` | Latest saved markdown | Frontmatter-stripped, heading-aware chunks with `contentHash` and token estimate |
| Chunk embedding | `indexSavedDocument()`, `embedText()` | Each saved chunk | Sequential 1024-dimension embeddings |
| Chunk store | `replaceDocumentChunks()` | Embedded chunks, source `updatedAt` | Fresh `DocumentChunk` rows; stale writes are guarded |
| Graph-aware scope building | `buildRetrievalScopes()` | Readable docs and persisted links | Current, linked, backlink, same-tag, fallback document ids for future expanded-scope flows |

## Entry points

사용자 Ask AI entry point는 `components/document-editor/ai-assistant-panel.tsx`다. Panel은 현재 문서 id와 trimmed `question`, browser/workspace별로 저장된 optional `chatProvider`/`chatModel` override, 그리고 current display language의 `uiLanguage`를 ask route로 보낸다. Unsaved title/content markdown이나 pending clipboard image paste payload는 request body에 넣지 않는다. 현재 editor draft가 saved DB document와 다르거나 pending paste upload가 있으면 saved-content-only warning을 표시한다. Ask AI labels, placeholder, warning, generic error, and shared thinking text는 `useI18n()` message catalog에서 렌더링하며 answer body/citations는 번역하지 않는다.

Server entry point는 `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`다. Route는 JSON body에서 `question`, optional provider+model pair, optional valid `uiLanguage`만 읽고, malformed JSON 또는 `null`/array JSON body는 missing question과 같은 `QUESTION_REQUIRED` 400 흐름으로 정규화한다. Invalid `uiLanguage`는 request rejection이 아니라 no UI language hint로 무시한다. Missing 또는 `null` `chatModel`은 no override로 처리하지만, `chatProvider`가 있으면 matching `chatModel`도 있어야 하며 provider-only override는 service 호출 전에 `INVALID_CHAT_MODEL` 400으로 중단한다. String override는 shared provider/model validators를 통과해야 한다. 인증 redirect는 broad service error catch 밖에서 유지하고, recoverable RAG runtime failure는 user-facing detail 없이 `AI_UNAVAILABLE` 503으로 정규화한다.

Ask AI core service는 `lib/rag/ask.ts`의 `askDocumentQuestion()`이다. 이 함수는 active workspace membership check, permission check, chat/Langfuse generation config, current-document context packing, direct prompt, LangChain answer generation, optional Langfuse metadata를 연결한다. Issue #104 backend slice 이후 Ask AI 기본 path는 selected document indexing refresh, retrieval scopes, question embedding/vector search, rerank를 호출하지 않는다. Issue #147 review follow-up 이후 archived workspace slug는 `WORKSPACE_NOT_FOUND`로 중단하므로 stale tab에서 Ask AI context를 읽지 않는다.

Workspace chatbot backend service는 `lib/rag/workspace-chat.ts`다. `getOrCreateWorkspaceChatThread()`는 현재 사용자+active workspace의 active thread를 만들거나 재사용한다. `prepareWorkspaceChatMessageStream()`은 message validation, active thread load, provider/model resolution, embedding index guard, conversation-aware retrieval, prompt creation, Langfuse trace metadata, chat model creation을 answer generation 전에 준비한다. `sendPreparedWorkspaceChatMessageStream()`은 prepared prompt/model로 `streamAnswerChain()`을 호출해 tokens를 전달하고, final answer가 성공했을 때만 normalized answer/citations를 persistence helper에 넘긴다. Existing `sendWorkspaceChatMessage()`는 같은 preparation과 persistence path를 공유하는 non-streaming wrapper다. Archived workspace slug는 `WORKSPACE_NOT_FOUND`로 중단하며 thread/message persistence 전에 실패한다. `app/api/workspaces/[workspaceSlug]/assistant/thread`와 `/thread/reset`은 JSON route로 thread state를 다루고, `/messages`는 validation/preparation error만 JSON으로 반환한 뒤 successful send를 `application/x-ndjson` stream으로 노출한다. `components/workspace-chatbot.tsx`가 workspace page의 우측 하단 launcher/panel로 이 endpoints를 호출한다.

## Steps

Ask AI direct-context request:

1. `askDocumentQuestion()`은 question을 trim하고 빈 질문이면 `QUESTION_REQUIRED`를 던진다.
2. Requested slug가 현재 actor membership이 있는 active workspace인지 확인하고 selected active document만 load한 뒤, workspace role과 explicit document permissions를 `filterReadableDocuments()`로 계산한다. Archived workspace는 `WORKSPACE_NOT_FOUND`로 중단한다.
3. Selected document가 readable set에 없으면 `DOCUMENT_NOT_FOUND`로 중단한다.
4. `askDocumentQuestion()`은 service boundary에서도 provider-only override를 `INVALID_CHAT_MODEL`로 거부한다. Validated `chatProvider` + `chatModel` override가 있으면 default chat provider env를 먼저 읽지 않고 override provider의 server-side credential/base URL만 사용해 generation config를 만든다. Model-only legacy override는 default provider를 읽어 compatibility를 판단한다. Embedding provider/model/dimension은 request에서 받지 않는다.
5. `buildCurrentDocumentContext()`가 selected saved markdown을 context budget에 맞게 pack한다. 문서가 budget 안에 들어가면 전체 saved markdown을 사용하고, 너무 길면 frontmatter/fenced-code heading을 고려한 heading-aware section subset을 만든다. Heading이 없는 긴 문서와 하나의 headed section이 budget보다 큰 문서는 paragraph/chunk fallback으로 쪼갠 뒤 질문 keyword score로 관련 chunk를 고른다.
6. `buildDirectDocumentPrompt()`는 현재 저장 문서 context만 근거로 system/user prompt와 current-document section citation metadata를 만든다. Optional `uiLanguage`가 valid하면 no-context fallback phrases와 model-facing status/fallback phrasing instruction에만 반영하고, system prompt는 별도 sentence로 `Answer in the same language as the question where possible.`를 계속 포함한다.
7. `createLangfuseCallbackConfig()`는 `rag.ask_document` operation, effective chat model, selected document id, current context partial 여부, prompt citation document ids를 metadata에 담는다. Direct Ask path는 retrieval-only fields인 `retrievedChunkCount`, `citationChunkIds`, embedding provider/model/dimension metadata를 보내지 않는다.
8. `invokeAnswerChain()`은 literal `SystemMessage`와 `HumanMessage`를 만들어 LangChain chat model에 전달한다. Saved context나 question 안의 JSON/code braces는 template 변수로 해석되지 않는다.
9. `normalizeAnswerCitations()`는 answer text에 실제로 등장한 `[n]` citation만 남기고, prompt 내부 source 번호가 `[8], [9], [3]`처럼 흩어져 있어도 answer 등장 순서대로 `[1], [2], [3]` display 번호를 다시 붙인다. 근거 부족 답변처럼 citation marker가 없는 answer는 빈 citation list를 반환한다.
10. Service는 정규화된 answer와 answer-referenced 현재 문서 section citations를 route에 반환하고, UI는 Markdown-rendered answer와 클릭 가능한 `[n] Document Title > Heading` source link를 표시한다.

Workspace chatbot UI/API/service request:

1. `WorkspaceChatbot`은 workspace page에 fixed bottom-right launcher로 mount된다. Icon을 클릭하면 compact panel을 열고 `/assistant/thread`를 GET해 active thread와 message history를 불러오며, 현재 browser override 또는 server default 기준 effective model id를 header 아래에 표시한다.
2. Panel submit은 trimmed message, 현재 selected document id, current display language의 `uiLanguage`, browser/workspace-scoped optional `chatProvider`/`chatModel` override를 `/assistant/messages`에 POST한다. Message fetch는 `AbortController.signal`을 사용하며, reset과 workspace change cleanup은 active send를 abort한다. Blank message, active send, pending answer, pending reset 중에는 submit handler가 새 send를 막고, reset 중에는 input/send/reset controls를 비활성화한다. Workspace AI launcher/panel/reset/close/send labels, empty state, placeholder, generic unavailable error, model label, and thinking text are catalog-backed; persisted user/assistant message content and citations stay unchanged.
3. Message route는 malformed JSON을 `INVALID_JSON`, blank message를 `MESSAGE_REQUIRED`, invalid `selectedDocumentId`를 `INVALID_SELECTED_DOCUMENT_ID`, invalid provider/model override를 `INVALID_CHAT_MODEL`로 service 호출 전에 정규화한다. Invalid `uiLanguage`는 request rejection이 아니라 no UI language hint로 무시한다. `chatProvider`가 있으면 matching `chatModel`도 필요하므로 provider-only payload는 service에 전달하지 않는다.
4. `prepareWorkspaceChatMessageStream()`는 message를 trim하고 빈 메시지면 `MESSAGE_REQUIRED`를 던진다.
5. Requested slug가 현재 actor membership이 있는 active workspace인지 확인하고 active documents를 load한 뒤, workspace role과 explicit document permissions로 readable active document ids를 계산한다. Archived workspace는 `WORKSPACE_NOT_FOUND`로 중단하므로 stale tab에서 chat thread나 message를 만들지 않는다.
6. `getOrCreateActiveThread()`는 `(workspaceId, userId)`의 active thread를 재사용하거나 생성한다. Concurrent create race는 PostgreSQL partial unique index의 `P2002`를 잡고 active thread를 다시 읽어 처리한다.
7. 기존 thread history는 display order로 정렬해 prompt와 UI에 사용한다. DB timestamp가 같은 성공 turn도 `USER`가 `ASSISTANT`보다 먼저 오도록 role order로 tie-break한다. Thread에 `memorySummary`가 있으면 retrieval query와 answer prompt의 conversation context 앞쪽에 포함한다.
8. Workspace chat preparation도 provider-only override를 `INVALID_CHAT_MODEL`로 거부한다. Validated `chatProvider` + `chatModel` override가 있으면 default chat provider env를 먼저 읽지 않고 override provider의 server-side credential/base URL과 fixed embedding config를 함께 읽는다. Model-only legacy override는 default provider를 읽어 compatibility를 판단한다. Provider credential, base URL, embedding provider/model/dimension은 request에서 받지 않는다.
9. `assertCurrentEmbeddingIndex()`로 현재 workspace retrieval이 Ollama `bge-m3` 1024 index identity와 맞는지 확인한다.
10. `buildWorkspaceConversationContext()`는 `memorySummary`, 마지막 요약 이후 새로 쌓인 recent messages, 현재 user message를 합친 memory-aware query 후보가 6,000자를 넘는지 먼저 판단한다. 초과하면 `conversation memory summarizer` prompt로 기존 memory와 새 대화 excerpt를 병합하고, 결과를 `AiChatThread.memorySummary` / `memoryUpdatedAt`에 저장한다. Summarization 실패는 Workspace AI 전체를 죽이지 않고 server log에 남기며 bounded recent context fallback을 사용한다.
11. `ensureWorkspaceChatRetrievalIndex()`는 memory-aware query terms와 readable active documents를 비교해 title/path/body가 맞는 missing 또는 stale documents를 최대 8개까지 `safeIndexSavedDocument()`로 먼저 refresh한다. Query가 "this document" 같은 selected-document referential prompt이고 `selectedDocumentId`가 readable이면 lexical score가 없어도 selected document를 refresh 후보에 포함하며, lexical candidates가 top-8 cap을 채워도 selected document를 cap 밖에서 강제 포함한다. 이미 current `DocumentChunk.sourceUpdatedAt`이 document `updatedAt`과 맞는 문서는 다시 색인하지 않는다.
12. `embedText()`는 thread memory summary, 최근 thread messages, 현재 user message를 합친 memory-aware query를 embedding한다. 이 query는 embedding model context를 넘지 않도록 최대 6,000자로 제한하되, 초과분은 raw history 일부를 버리는 대신 먼저 thread memory summary로 병합한다. 이전 assistant answer의 `[n]` citation marker는 새 retrieval/prompt citation 번호와 섞이지 않도록 history text에서 제거한다. `searchSimilarChunks()`는 먼저 readable active document ids 전체에서 current `DocumentChunk` rows를 검색하고, readable `selectedDocumentId`가 있으면 selected document id만 대상으로 한 번 더 검색해 global top-60 밖의 open-document chunks도 후보에 병합한다.
13. Service는 readable `selectedDocumentId`에 해당하는 chunks가 top vector result와 충분히 가까울 때만 prompt candidate 앞쪽으로 stable하게 우선 배치한 뒤, prompt chunk를 최대 12개, 문서당 최대 3개로 제한한다. 선택 문서가 검색상 너무 멀면 기존 vector order를 유지해 무관 문서가 context를 차지하지 않게 한다.
14. `buildRagPrompt()`는 memory-aware conversation question과 capped saved chunks를 근거로 prompt/citation metadata를 만든다. Optional `uiLanguage`는 no saved context fallback phrase와 model-facing fallback/status phrasing instruction에만 반영하며, embedding/retrieval query는 원래 user message/conversation question을 그대로 사용한다.
15. `createLangfuseCallbackConfig()`는 `rag.workspace_chat` operation, effective provider/model, retrieved chunk count, prompt citation document ids, citation chunk ids, thread/workspace/actor metadata를 만든다. `prepareWorkspaceChatMessageStream()`은 이 prompt, prompt chunk count, citation chunk ids, trace, chat model, and effective chat model name을 prepared object로 반환한다.
16. Non-streaming sends use `invokeAnswerChain()` with the prepared prompt/model, while service-layer streaming sends use `streamAnswerChain()` and pass each parsed token to `onToken`. `/assistant/messages` calls `prepareWorkspaceChatMessageStream()` before constructing the response stream, so validation and preparation failures remain JSON responses through `workspaceChatErrorResponse()`. Once the `application/x-ndjson` stream starts, it emits `{ type: "start" }`, raw model `{ type: "token", content }` events, and a final `{ type: "done", thread, userMessage, assistantMessage, citations }` event after persistence. The route passes `request.signal` into preparation and streaming so client aborts can stop indexing/embedding/search/model work and prevent aborted turns from being persisted. The streaming response uses `cache-control: no-cache, no-transform` and treats writes to a cancelled response body as no-op. If `sendPreparedWorkspaceChatMessageStream()` fails after stream start, the route emits `{ type: "error", error: "THREAD_ARCHIVED" }` for a post-start archived-thread race, otherwise `{ type: "error", error: "AI_UNAVAILABLE" }`, keeps HTTP 200, and closes the stream. Clients should treat the final `done` payload as authoritative because it contains normalized persisted content and citations.
17. `normalizeAnswerCitations()`가 answer text에 실제로 등장한 `[n]` citation만 assistant message와 route response에 남기고, display 번호를 answer 등장 순서의 `1..n`으로 정규화한다.
18. Prisma transaction 안에서 thread가 아직 `ACTIVE`인지 `updateMany({ id, status: "ACTIVE" })`로 다시 확인한다. Reset이 먼저 archive했다면 `THREAD_ARCHIVED`를 던지고 stale assistant response를 저장하지 않는다.
19. Thread가 active이면 user message와 정규화된 assistant answer를 같은 successful transaction에서 저장하고, normalized `citations`, prompt `contextMeta`, effective `model`, `lastMessageAt`을 갱신한다. Answer generation, streaming failure after partial tokens, retrieval failure는 orphan `USER` message를 남기지 않는다.
20. `readWorkspaceChatStream()` reads the NDJSON response body with `ReadableStreamDefaultReader` and `TextDecoder`, supports multiple event lines per chunk and partial lines across chunks, rejects malformed non-empty event lines, and rejects EOF without terminal `done` or `error` as `WORKSPACE_CHAT_STREAM_INCOMPLETE`. `WorkspaceChatbot` appends an optimistic user message immediately, shows localized thinking text until the first token, streams tokens into an assistant placeholder, then replaces that placeholder with the authoritative `done.assistantMessage` and `done.citations`. If a stream error event, incomplete stream, invalid stream, missing body, or fetch failure happens for the current generation, the client removes the optimistic user message and partial assistant placeholder and shows localized Workspace AI unavailable text. Aborted or stale generations are ignored.
21. Client는 request generation/version guard로 delayed thread load나 delayed send stream이 workspace change 또는 reset 이후의 visible conversation을 덮어쓰지 못하게 한다.

## Provider And Index Contract

```mermaid
flowchart LR
    ServerEnv["Server env<br/>provider, base URL, API key, default models"] --> Config["getRagModelConfig()"]
    Settings["Workspace settings panel<br/>browser/workspace provider + model"] --> Request["Ask request<br/>optional chatProvider + chatModel"]
    Request --> Override["askDocumentQuestion()<br/>resolve effective chat provider/model"]
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

Issue #102 이후 OpenRouter 같은 OpenAI-compatible cloud chat model 테스트는 server env에 provider/base URL/API key/default model을 둔 뒤, workspace settings panel에서 browser/workspace-scoped chat model id override를 저장하는 방식으로 시작했다. Issue #109는 이 surface를 provider+model override로 확장해 settings panel이 `ollama`, `openai`, `openai-compatible` 중 chat provider와 model id를 함께 저장하고, Ask AI request와 workspace chatbot message request의 optional `chatProvider`/`chatModel` fields로 전달하게 한다. Server는 validated provider+model으로 answer-generation `chat` config만 다시 만들고, API key/base URL은 provider별 server env에서 읽으며, embedding provider/model/dimension과 vector index identity는 request에서 받지 않는다. A complete provider+model override is resolved before reading the default chat provider config, so an Ollama override can still run when the default OpenAI-compatible chat provider env is incomplete; the selected override provider must still have its own required server-side config. OpenRouter presets include `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `openai/gpt-oss-20b:free`, and `openai/gpt-oss-120b:free`, all stored with `openai-compatible`. Static presets are shown only when the selected provider is `openai-compatible`; Ollama and OpenAI keep direct model-id input plus provider-filtered custom models. The settings panel distinguishes malformed model ids from provider-incompatible ids and `Save custom model` also registers the custom provider+model pair in a browser/workspace custom list. Legacy string-only browser storage remains readable through the current default or inferred provider. Issue #133 adds a server-derived chat provider availability map: Ollama is always shown, official OpenAI is shown only when `OPENAI_API_KEY` or `MUNJIB_OPENAI_API_KEY` is present, and OpenAI-compatible/OpenRouter is shown only when `MUNJIB_OPENAI_COMPATIBLE_BASE_URL` is present. The settings panel hides unavailable providers and ignores stale browser overrides for unavailable providers; Ask AI and Workspace AI clients also drop those stale overrides before sending requests so missing server env does not keep producing provider-configuration 503s from old localStorage values. PR #134 review follow-up makes the client fallback explicit: if no usable stored override exists and the server default provider is unavailable, Ask AI and Workspace AI send the first available provider's reset-default provider/model pair instead of omitting override fields and falling back to the broken server default.

Embedding provider/model/dimension 변경은 아직 reindex workflow와 vector dimension migration을 포함하지 않는다. Issue #104 direct Ask path는 embedding이나 vector retrieval을 사용하지 않으므로 current document answer를 embedding config parsing이나 embedding index guard에 묶지 않는다. Existing `DocumentChunk` indexing과 workspace chatbot retrieval은 current indexed identity인 Ollama `bge-m3` 1024가 아니면 partial or incompatible vector access를 만들지 않고 fail-fast한다.

## Retrieval And Ranking

Issue #104 direct Ask path는 retrieval scope expansion을 기본으로 사용하지 않는다. 현재 문서 질문은 selected saved markdown을 직접 pack하고, citation도 현재 문서 section만 가리킨다. Heading이 없는 긴 문서와 budget보다 큰 headed section은 전체 body를 앞에서부터 자르지 않고 paragraph/chunk sections로 나눠 관련 evidence가 뒤쪽에 있어도 context 후보가 될 수 있게 한다. Direct prompt는 각 selected section content 앞에 `[n] Document > Heading` label을 inline으로 붙여 model이 context text와 citation number를 같은 block에서 볼 수 있게 한다.

Workspace chatbot retrieval은 permission-safe readable active document ids만 사용한다. 현재 implementation은 vector search 전에 memory-aware conversation query와 readable documents의 title/path/body keyword overlap을 사용해 lexically relevant missing/stale documents만 최대 8개 refresh한다. Query가 selected-document referential prompt이면 readable selected document도 refresh 후보에 포함하고, lexical candidates가 cap을 채워도 selected document를 별도로 보존한다. 이 targeted backfill은 기존 workspace에 `DocumentChunk` rows가 거의 없어서 Welcome 같은 단일 chunk만 검색되는 상태를 완화하되, 모든 workspace document를 매 질문마다 색인하지 않는다. 이후 thread memory summary, recent thread messages, 현재 user message를 합친 memory-aware query embedding으로 current `DocumentChunk` rows를 검색한다. Query 후보가 6,000자를 넘으면 long assistant answers나 pasted content를 raw history에서 잘라 버리지 않고 `conversation memory summarizer` answer chain으로 `AiChatThread.memorySummary`에 병합한다. 다음 turn에서는 `memoryUpdatedAt` 이후 새로 쌓인 messages만 memory refresh 후보가 되므로 이미 요약된 긴 history를 반복 요약하지 않는다. Readable selected document id가 있으면 selected-document-only search 결과를 병합한다. 이전 assistant answer에 있던 `[n]` marker는 새 prompt의 citation namespace와 충돌하지 않도록 conversation history에서 제거한다. 이렇게 global retrieval limit 밖의 open-document chunks도 후보로 보존하되, selected chunks가 top result와 충분히 가까울 때만 prompt cap 전에 stable하게 우선 배치한다. 그 뒤 prompt 후보를 최대 12개, 문서당 최대 3개로 제한해 한 문서가 sources를 과점하지 않게 한다. Readable하지 않은 selected document id는 Langfuse metadata와 retrieval priority에 반영하지 않는다. Persisted history display는 timestamp tie에서 `USER` before `ASSISTANT`를 적용해 같은 transaction으로 저장된 successful turn이 assistant-before-user 순서로 뒤집히지 않게 한다.

Legacy graph-aware scope expansion helper는 selected current document를 우선하고, saved markdown wiki links와 persisted outgoing links를 합친 linked documents, persisted backlinks, shared normalized tags, workspace fallback 순서로 중복 없이 채운다. 이 helper는 Issue #104 direct Ask default path에서는 호출하지 않고, future explicit expanded-scope Ask AI나 retrieval tuning의 근거로 남아 있다.

Legacy reranking score는 다음 공식이다.

```text
(1 - cosine distance) + scope boost + bounded keyword overlap boost
```

Current document boost는 `0.5`, linked document `0.3`, backlink `0.25`, same-tag `0.15`다. Keyword boost는 unique term당 `0.05`, maximum `0.2`다. Token overlap은 punctuation-normalized Unicode terms를 사용하고, English stop words와 too-short Latin terms는 제외하지만 Korean/CJK 2글자 terms는 후보로 유지한다.

## Issue #104 Split

Issue #104는 기존 RAG/vector DB를 제거하지 않고 AI surface별 request profile을 분리한다. 구현 범위는 `lib/rag/document-context.ts`의 현재 문서 context packer, `components/ai/thinking-indicator.tsx`의 공통 elapsed-time indicator, `AiChatThread`/`AiChatMessage` schema, Ask AI direct-context service, workspace chatbot RAG service, authenticated chatbot API routes, 우측 하단 workspace chatbot UI다.

Ask AI service는 기본 path에서 selected document re-indexing, question embedding, vector search, workspace fallback retrieval을 호출하지 않는다. 대신 현재 저장 markdown이 context budget 안에 들어가면 전체 문서를 prompt에 직접 넣고, 너무 긴 문서는 heading-aware section packer 또는 no-heading paragraph chunk fallback으로 관련 섹션을 선택한다. Ask AI citation은 현재 문서 section만 후보로 만들되, answer text가 실제로 참조한 `[n]` section만 UI에 반환하고, display number는 answer 등장 순서대로 다시 `1..n`으로 붙인다.

새 workspace chatbot은 우측 하단 sticky AI launcher와 compact chat panel을 제공하는 별도 surface다. UI는 active thread history를 load하고, streamed message send와 conversation reset을 지원하며, selected document id를 message request metadata로 넘긴다. Client는 workspace change, delayed thread load, delayed send stream, pending reset race를 generation/version guard와 active-send abort로 방어한다. Backend service는 사용자+workspace별 active `AiChatThread`와 `AiChatMessage` history를 저장하고, PostgreSQL partial unique index가 `(workspaceId, userId)`별 `ACTIVE` thread를 하나로 제한한다. Service layer는 concurrent create race를 이 DB invariant에 맞춰 처리하고, answer generation 중 reset이 thread를 archive한 경우 stale assistant response를 저장하지 않는다. Chatbot answer turn retrieval은 질문과 readable documents의 lexical overlap으로 missing/stale chunks를 targeted refresh한 뒤 기존 `DocumentChunk` rows에서 readable active document chunks를 검색하고, follow-up 질문의 지시어가 이전 대화 주제를 잃지 않도록 bounded conversation-aware query를 embedding한다. Readable selected document chunks는 vector distance가 top result와 충분히 가까울 때만 prompt cap 전에 우선 배치하고, returned citations는 answer가 실제로 참조한 citation marker로 필터링한 뒤 display number를 answer 등장 순서대로 정규화한다.

Ask AI panel과 workspace chatbot은 `components/ai/answer.tsx`의 공통 renderer로 assistant answer Markdown을 표시한다. 따라서 model output의 bullet, bold, inline code 같은 Markdown marker는 raw text로 노출하지 않고 읽을 수 있는 HTML로 렌더링한다. Citation list는 citation에 `documentId`가 있을 때 `workspaceDocumentHref()` 기반 source link로 표시하며, 클릭하면 해당 workspace document URL로 이동한다.

Ask AI와 chatbot은 model config, browser/workspace chat model override validation, answer-chain invocation, Langfuse metadata, permission-safe document loading, thinking indicator UI를 공유할 수 있지만, 하나의 overloaded service function으로 합치지 않는다. Issue #126 이후 공통 Thinking indicator는 elapsed-time message key를 유지하고 shared English/Korean i18n catalog로 현재 display language의 status text를 렌더링한다. Issue #105는 Workspace AI answer body만 newline-delimited JSON stream으로 보내며, Ask AI는 이 slice에서 non-streaming direct-context flow를 유지한다. Validation failure는 기존 JSON error response를 유지하고, retrieval/indexing/memory phase는 stream하지 않으며, model answer token과 final persisted assistant message/citations만 stream contract에 포함한다. Issue #105 implementation includes `lib/rag/answer-chain.ts`의 `streamAnswerChain()` seam, `lib/rag/workspace-chat.ts`의 prepared streaming service seam, `/assistant/messages` `application/x-ndjson` route, and `components/workspace-chatbot-stream.ts` client reader. 설계 근거는 `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`와 `docs/superpowers/specs/2026-06-17-chatbot-response-streaming-design.md`이고, Issue #104 구현 계획은 `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`에 둔다.

## Observability And Privacy

Sentry는 app/runtime error와 low-sample tracing 용도이며, RAG prompt/context body를 보내는 관측 계층이 아니다. Sentry privacy scrubber와 production 설정은 [[Production Observability Workflow]]에서 관리한다.

Issue #116 이후 Ask AI route와 Workspace AI messages route는 recoverable provider/runtime failure를 user-facing detail 없이 `AI_UNAVAILABLE`으로 유지하면서 Sentry에는 sanitized handled-error event를 명시 capture한다. Ask AI의 pre-response 503은 `ask_document`, Workspace AI preparation 중 503은 `workspace_chat_prepare`, NDJSON stream 시작 이후 provider/runtime failure는 HTTP 200 stream 안의 `AI_UNAVAILABLE` error event와 함께 `workspace_chat_stream` surface로 기록한다. Sentry payload는 workspace slug, surface, status, stable RAG error code, validated chat provider/model, stream-started flag 같은 운영 metadata만 담고, event fingerprint는 handled AI unavailable marker, surface, stable RAG error code로 묶는다. Question, prompt, saved markdown, retrieved chunk text, answer, API key, base URL, headers, cookies, raw provider response body, original provider error object/cause는 넣지 않는다.

Langfuse는 optional/fail-open layer다. `LANGFUSE_PUBLIC_KEY`와 `LANGFUSE_SECRET_KEY`가 없거나 `MUNJIB_LANGFUSE_ENABLED=false`면 disabled다. Metadata mode는 기본값이고 LangChain callback이나 OpenTelemetry exporter를 붙이지 않는다. 따라서 production container에서 Langfuse keys/base URL이 비어 있거나 capture가 `metadata`이면 AI 503이 Langfuse trace로 보이지 않는 것이 expected behavior다. Full capture는 `MUNJIB_LANGFUSE_CAPTURE_MODE=full` 또는 legacy `MUNJIB_LANGFUSE_CAPTURE=full` 중 하나라도 설정된 경우에만 켜진다.

Full capture가 켜진 Node runtime에서는 `instrumentation.ts`가 `initializeLangfuseOtel()`을 호출하고, `lib/rag/langfuse-otel.ts`가 `@opentelemetry/sdk-node` `NodeSDK`와 `@langfuse/otel` `LangfuseSpanProcessor`를 시작한다. Answer generation에는 `@langfuse/langchain` callback이 연결된다. Startup failure, missing credentials, metadata mode, non-node runtime은 Ask AI request를 실패시키지 않는다.

## Failure Modes

Selected document가 actor에게 readable하지 않으면 `DOCUMENT_NOT_FOUND`로 처리한다. 빈 question은 `QUESTION_REQUIRED`다. 선택된 effective chat provider env가 불완전하거나 unsupported provider이면 answer generation 전에 `INVALID_CONFIG` 계열 recoverable RAG error로 이어진다. Complete provider+model override가 있으면 default chat provider env가 불완전해도 해당 default provider를 먼저 읽지 않는다. Embedding provider/dimension config 오류는 direct Ask path를 막지 않지만, `DocumentChunk` indexing과 workspace chatbot retrieval에서는 current index guard와 함께 fail-fast한다.

Embedding request failure, invalid embedding shape, chat request failure, vector search/indexing failure는 stable RAG error code로 mapping된다. Answer and embedding provider catch blocks는 원본 error를 server log에 남기고, route는 user-facing response를 `AI_UNAVAILABLE`로 정규화한다.

Issue #116의 handled AI unavailable capture는 이 response contract를 바꾸지 않는다. Ask AI와 Workspace AI pre-stream preparation failure는 기존 JSON body/status를 유지하고, Workspace AI post-start stream failure는 기존 NDJSON `AI_UNAVAILABLE` event와 HTTP 200 stream contract를 유지한다. Capture 대상은 `isRagRuntimeError()`로 확인된 stable RAG runtime code뿐이며, validation errors, auth redirects, archived-thread races, client aborts는 provider unavailable Sentry event로 기록하지 않는다.

Indexing은 saved content refresh를 best-effort로 수행한다. Empty markdown은 chunks를 clear하고, stale replacement job은 expected `updatedAt` guard로 latest chunks를 덮지 못한다. Indexing failure는 document save 자체를 실패시키지 않지만, ask request 중 selected document indexing이나 embedding/vector search failure는 answer generation 전에 중단될 수 있다.

## Tests

RAG process 변경은 최소한 관련 unit/integration tests를 함께 확인한다.

```bash
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot
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
- GitHub issue #116
- `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`
- `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`
- `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`
- `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`
- `docs/superpowers/specs/2026-06-20-ai-provider-503-sentry-capture-design.md`
- `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`
- `docs/superpowers/plans/2026-06-20-ai-provider-503-sentry-capture.md`
- `components/document-editor/ai-assistant-panel.tsx`
- `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- `lib/rag/ask.ts`
- `lib/rag/document-context.ts`
- `lib/rag/workspace-chat.ts`
- `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`
- `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`
- `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`
- `app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route.ts`
- `lib/observability/ai-unavailable.ts`
- `tests/observability/ai-unavailable.test.ts`
- `tests/rag/ask-route.test.ts`
- `tests/rag/workspace-chat-route.test.ts`
- `components/workspace-chatbot.tsx`
- `components/workspace-chatbot-stream.ts`
- `components/ai/answer.tsx`
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
- `tests/rag/workspace-chat-route.test.ts`
- `tests/components/workspace-chatbot.test.tsx`
- `tests/rag/model-config.test.ts`
- `tests/rag/model-factory.test.ts`
- `tests/rag/embedding-client.test.ts`
- `tests/rag/answer-chain.test.ts`
- `tests/rag/langfuse.test.ts`
- `tests/rag/langfuse-otel.test.ts`
- `tests/rag/retriever.test.ts`
- `tests/rag/vector-store.test.ts`
