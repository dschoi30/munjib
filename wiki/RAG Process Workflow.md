---
id: workflow-rag-process
title: RAG Process Workflow
type: workflow
status: active
summary: Munjib Ask AI direct-context와 workspace chatbot RAG의 saved-content-only request, retrieval, provider, observability 흐름.
created: 2026-06-13
updated: 2026-06-15
source_count: 68
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

Issue #104 구현 이후 Ask AI의 기본 service path는 현재 저장 문서 direct-context answer다. `askDocumentQuestion()`은 selected document re-indexing, question embedding, vector search, graph-aware scope expansion, rerank를 호출하지 않고, 현재 저장 markdown을 `buildCurrentDocumentContext()`로 pack한 뒤 `buildDirectDocumentPrompt()`와 LangChain answer chain으로 답한다. Direct Ask는 chat/Langfuse generation config만 읽으므로 embedding provider/model/dimension env가 invalid여도 현재 문서 답변 자체를 막지 않는다. 기존 `DocumentChunk` pgvector store는 제거하지 않고, workspace chatbot이 사용자+workspace conversation history와 함께 readable workspace document retrieval에 재사용한다. Chatbot은 authenticated API route와 우측 하단 floating UI로 `getOrCreateWorkspaceChatThread()`, `sendWorkspaceChatMessage()`, `resetWorkspaceChatThread()`를 감싼다. Response streaming은 Issue #105 follow-up으로 분리한다.

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
    AskReadable -- "Yes" --> AskContext["buildCurrentDocumentContext()<br/>full doc, heading-aware pack,<br/>or no-heading paragraph chunks"]
    AskContext --> AskPrompt["buildDirectDocumentPrompt()<br/>current document sections only"]
    AskPrompt --> AskTrace["Langfuse metadata<br/>operation rag.ask_document"]
    AskTrace --> AskAnswer["invokeAnswerChain()<br/>LangChain chat model"]
    AskAnswer --> AskUI["Answer + current-document citations"]

    ChatUser["Workspace chatbot panel<br/>message + selectedDocumentId"] --> ChatRoute["Assistant routes<br/>thread, messages, reset"]
    ChatRoute --> ChatService["sendWorkspaceChatMessage()"]
    ChatService --> Thread["Get/create active AiChatThread<br/>P2002 retry"]
    Thread --> UserMessage["Persist USER message"]
    UserMessage --> ChatConfig["getRagModelConfig()<br/>embedding index guard"]
    ChatConfig --> ChatBackfill["ensureWorkspaceChatRetrievalIndex()<br/>targeted missing/stale chunk backfill"]
    ChatBackfill --> ChatEmbed["embedText(conversation-aware query)"]
    ChatEmbed --> ChatSearch["searchSimilarChunks()<br/>readable active document ids"]
    ChatSearch --> ChatCap["Cap prompt chunks<br/>12 total, 3 per document"]
    ChatCap --> ChatPrompt["buildRagPrompt()<br/>recent conversation + chunks"]
    ChatPrompt --> ChatAnswer["invokeAnswerChain()"]
    ChatAnswer --> UsedCitations["filterCitationsToAnswer()<br/>keep only answer-referenced sources"]
    UsedCitations --> ActiveCheck{"Thread still ACTIVE?"}
    ActiveCheck -- "No" --> Stale["THREAD_ARCHIVED<br/>drop stale assistant response"]
    ActiveCheck -- "Yes" --> Persist["Persist ASSISTANT<br/>citations, contextMeta, model"]
```

| Phase | Code path | Input | Output |
| --- | --- | --- | --- |
| UI request | `components/document-editor/ai-assistant-panel.tsx` | Saved document id, trimmed question, optional browser/workspace `chatModel` | Ask route payload; unsaved draft stays out of RAG |
| Route validation | `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts` | JSON body | Normalized `question`, validated optional `chatModel`, or stable 400 error |
| Ask permission gate | `askDocumentQuestion()`, `filterReadableDocuments()` | Workspace role, selected active document, explicit document permissions | Permission-safe selected document |
| Provider boundary | `getRagGenerationConfig()`, `getRagModelConfig()`, and in-memory override | Server env plus optional `chatModel` | Effective chat model; Ask direct path does not validate embedding env; chatbot retrieval keeps embedding provider/model/dimension unchanged |
| Ask context packing | `buildCurrentDocumentContext()` | Selected saved markdown and question | Full saved markdown, heading-aware section subset, no-heading paragraph chunk subset, or oversized-heading paragraph chunk subset with inline citation labels |
| Ask prompt and citations | `buildDirectDocumentPrompt()`, `filterCitationsToAnswer()` | Current document context and answer text | System/user prompt plus answer-referenced current document section citations |
| Ask answer generation | `invokeAnswerChain()` | Direct-context messages, effective chat model, optional callbacks | Answer text grounded in current saved document |
| Chatbot UI | `components/workspace-chatbot.tsx`, `app/workspaces/[workspaceSlug]/page.tsx` | Workspace slug, selected document id, active thread state, optional browser/workspace `chatModel` | Fixed bottom-right launcher, compact panel, thread history, send/reset controls |
| Chat route validation | `app/api/workspaces/[workspaceSlug]/assistant/*/route.ts` | Authenticated request and JSON body | Thread load, validated optional `chatModel`, message send, reset/archive responses with stable error mapping |
| Chat thread persistence | `getOrCreateWorkspaceChatThread()`, `sendWorkspaceChatMessage()` | Workspace/user and message | Active thread, persisted user message, persisted assistant message |
| Chat index guard | `assertCurrentEmbeddingIndex()` | Server model config | Fail-fast unless workspace retrieval index identity is Ollama `bge-m3` 1024 |
| Chat targeted index backfill | `ensureWorkspaceChatRetrievalIndex()`, `safeIndexSavedDocument()` | Conversation-aware query, readable active documents, current embedding model | Missing/stale chunks for lexically relevant readable documents are refreshed before vector search |
| Chat retrieval | `embedText()`, `searchSimilarChunks()` | Conversation-aware query embedding, readable document ids | Candidate saved chunks from current `DocumentChunk` rows |
| Chat prompt and citations | `buildRagPrompt()`, `filterCitationsToAnswer()` | Recent conversation, capped chunks, and answer text | Saved-context prompt plus answer-referenced chunk citations |
| Chat stale response guard | Prisma transaction in `sendWorkspaceChatMessage()` | Thread id and delayed answer | Assistant response is saved only if the thread is still `ACTIVE` |
| Langfuse metadata | `createLangfuseCallbackConfig()` | operation/provider/model/citation metadata | Metadata-only by default; callbacks only in explicit full mode |
| UI result | Assistant panel or future chatbot panel | Answer and filtered citations | Rendered answer plus only `[n]` citations used by the answer |

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

Ask AI core service는 `lib/rag/ask.ts`의 `askDocumentQuestion()`이다. 이 함수는 permission check, chat/Langfuse generation config, current-document context packing, direct prompt, LangChain answer generation, optional Langfuse metadata를 연결한다. Issue #104 backend slice 이후 Ask AI 기본 path는 selected document indexing refresh, retrieval scopes, question embedding/vector search, rerank를 호출하지 않는다.

Workspace chatbot backend service는 `lib/rag/workspace-chat.ts`다. `getOrCreateWorkspaceChatThread()`는 현재 사용자+workspace의 active thread를 만들거나 재사용하고, `sendWorkspaceChatMessage()`는 user message persistence, existing `DocumentChunk` retrieval, recent conversation prompt, answer generation, assistant message persistence를 담당한다. `app/api/workspaces/[workspaceSlug]/assistant/thread`, `/messages`, `/thread/reset` route는 이 service를 인증된 JSON API로 노출하고, `components/workspace-chatbot.tsx`가 workspace page의 우측 하단 launcher/panel로 호출한다.

## Steps

Ask AI direct-context request:

1. `askDocumentQuestion()`은 question을 trim하고 빈 질문이면 `QUESTION_REQUIRED`를 던진다.
2. Workspace membership과 selected active document만 load한 뒤, workspace role과 explicit document permissions를 `filterReadableDocuments()`로 계산한다.
3. Selected document가 readable set에 없으면 `DOCUMENT_NOT_FOUND`로 중단한다.
4. `getRagGenerationConfig()`가 server-wide env에서 chat provider와 Langfuse config만 읽는다. Ask route가 validated `chatModel` override를 전달한 경우 service는 `chat.model`만 in-memory로 바꾸고 provider credential, base URL, embedding provider/model/dimension은 request에서 받지 않는다.
5. `buildCurrentDocumentContext()`가 selected saved markdown을 context budget에 맞게 pack한다. 문서가 budget 안에 들어가면 전체 saved markdown을 사용하고, 너무 길면 frontmatter/fenced-code heading을 고려한 heading-aware section subset을 만든다. Heading이 없는 긴 문서와 하나의 headed section이 budget보다 큰 문서는 paragraph/chunk fallback으로 쪼갠 뒤 질문 keyword score로 관련 chunk를 고른다.
6. `buildDirectDocumentPrompt()`는 현재 저장 문서 context만 근거로 system/user prompt와 current-document section citation metadata를 만든다.
7. `createLangfuseCallbackConfig()`는 `rag.ask_document` operation, effective chat model, selected document id, current context partial 여부, prompt citation document ids를 metadata에 담는다. Direct Ask path는 retrieval-only fields인 `retrievedChunkCount`, `citationChunkIds`, embedding provider/model/dimension metadata를 보내지 않는다.
8. `invokeAnswerChain()`은 literal `SystemMessage`와 `HumanMessage`를 만들어 LangChain chat model에 전달한다. Saved context나 question 안의 JSON/code braces는 template 변수로 해석되지 않는다.
9. `filterCitationsToAnswer()`는 answer text에 실제로 등장한 `[n]` citation만 남긴다. 근거 부족 답변처럼 citation marker가 없는 answer는 빈 citation list를 반환한다.
10. Service는 answer와 answer-referenced 현재 문서 section citations를 route에 반환하고, UI는 answer body와 `[n] Document Title > Heading` citation을 표시한다.

Workspace chatbot UI/API/service request:

1. `WorkspaceChatbot`은 workspace page에 fixed bottom-right launcher로 mount된다. Icon을 클릭하면 compact panel을 열고 `/assistant/thread`를 GET해 active thread와 message history를 불러온다.
2. Panel submit은 trimmed message, 현재 selected document id, browser/workspace-scoped optional `chatModel` override를 `/assistant/messages`에 POST한다. Blank message, pending answer, pending reset 중에는 send를 막고, reset 중에는 input/send/reset controls를 비활성화한다.
3. Message route는 malformed JSON을 `INVALID_JSON`, blank message를 `MESSAGE_REQUIRED`, invalid `selectedDocumentId`를 `INVALID_SELECTED_DOCUMENT_ID`, invalid `chatModel`을 `INVALID_CHAT_MODEL`로 service 호출 전에 정규화한다.
4. `sendWorkspaceChatMessage()`는 message를 trim하고 빈 메시지면 `MESSAGE_REQUIRED`를 던진다.
5. Workspace membership과 active documents를 load하고, workspace role과 explicit document permissions로 readable active document ids를 계산한다.
6. `getOrCreateActiveThread()`는 `(workspaceId, userId)`의 active thread를 재사용하거나 생성한다. Concurrent create race는 PostgreSQL partial unique index의 `P2002`를 잡고 active thread를 다시 읽어 처리한다.
7. User message를 `AiChatMessage(role=USER)`로 저장한다.
8. `getRagModelConfig()`로 server-wide provider/base URL/API key와 default model을 읽고, validated `chatModel` override가 있으면 `chat.model`만 in-memory로 대체한다. Provider credential, base URL, embedding provider/model/dimension은 request에서 받지 않는다.
9. `assertCurrentEmbeddingIndex()`로 현재 workspace retrieval이 Ollama `bge-m3` 1024 index identity와 맞는지 확인한다.
10. `ensureWorkspaceChatRetrievalIndex()`는 conversation-aware query terms와 readable active documents를 비교해 title/path/body가 맞는 missing 또는 stale documents를 최대 8개까지 `safeIndexSavedDocument()`로 먼저 refresh한다. Query가 "this document" 같은 selected-document referential prompt이고 `selectedDocumentId`가 readable이면 lexical score가 없어도 selected document를 refresh 후보에 포함한다. 이미 current `DocumentChunk.sourceUpdatedAt`이 document `updatedAt`과 맞는 문서는 다시 색인하지 않는다.
11. `embedText()`는 최근 thread messages와 현재 user message를 합친 conversation-aware query를 embedding한다. `searchSimilarChunks()`는 먼저 readable active document ids 전체에서 current `DocumentChunk` rows를 검색하고, readable `selectedDocumentId`가 있으면 selected document id만 대상으로 한 번 더 검색해 global top-60 밖의 open-document chunks도 후보에 병합한다.
12. Service는 readable `selectedDocumentId`에 해당하는 chunks가 top vector result와 충분히 가까울 때만 prompt candidate 앞쪽으로 stable하게 우선 배치한 뒤, prompt chunk를 최대 12개, 문서당 최대 3개로 제한한다. 선택 문서가 검색상 너무 멀면 기존 vector order를 유지해 무관 문서가 context를 차지하지 않게 한다.
13. `buildRagPrompt()`는 최근 thread message와 현재 user message를 합친 conversation question, 그리고 capped saved chunks를 근거로 prompt/citation metadata를 만든다.
14. `createLangfuseCallbackConfig()`는 `rag.workspace_chat` operation, effective provider/model, retrieved chunk count, prompt citation document ids, citation chunk ids, thread/workspace/actor metadata를 만든다.
15. `invokeAnswerChain()`이 answer를 생성하면 `filterCitationsToAnswer()`가 answer text에 실제로 등장한 `[n]` citation만 assistant message와 route response에 남긴다.
16. Prisma transaction 안에서 thread가 아직 `ACTIVE`인지 `updateMany({ id, status: "ACTIVE" })`로 다시 확인한다. Reset이 먼저 archive했다면 `THREAD_ARCHIVED`를 던지고 stale assistant response를 저장하지 않는다.
17. Thread가 active이면 user message와 assistant message를 같은 successful transaction에서 저장하고, filtered `citations`, prompt `contextMeta`, effective `model`, `lastMessageAt`을 갱신한다. Answer generation이나 retrieval이 실패하면 orphan `USER` message를 남기지 않는다.
18. Client는 request generation/version guard로 delayed thread load나 delayed send response가 workspace change 또는 reset 이후의 visible conversation을 덮어쓰지 못하게 한다.

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

Issue #102 이후 OpenRouter 같은 OpenAI-compatible cloud chat model 테스트는 server env에 provider/base URL/API key/default model을 둔 뒤, workspace settings panel에서 browser/workspace-scoped chat model id override를 저장하는 방식으로 한다. 이 override는 Ask AI request와 workspace chatbot message request의 `chatModel` field로 전달되고, server는 validated string으로 `chat.model`만 대체한다. Provider, base URL, API key, embedding provider/model/dimension은 request에서 받지 않는다.

Embedding provider/model/dimension 변경은 아직 reindex workflow와 vector dimension migration을 포함하지 않는다. Issue #104 direct Ask path는 embedding이나 vector retrieval을 사용하지 않으므로 current document answer를 embedding config parsing이나 embedding index guard에 묶지 않는다. Existing `DocumentChunk` indexing과 workspace chatbot retrieval은 current indexed identity인 Ollama `bge-m3` 1024가 아니면 partial or incompatible vector access를 만들지 않고 fail-fast한다.

## Retrieval And Ranking

Issue #104 direct Ask path는 retrieval scope expansion을 기본으로 사용하지 않는다. 현재 문서 질문은 selected saved markdown을 직접 pack하고, citation도 현재 문서 section만 가리킨다. Heading이 없는 긴 문서와 budget보다 큰 headed section은 전체 body를 앞에서부터 자르지 않고 paragraph/chunk sections로 나눠 관련 evidence가 뒤쪽에 있어도 context 후보가 될 수 있게 한다. Direct prompt는 각 selected section content 앞에 `[n] Document > Heading` label을 inline으로 붙여 model이 context text와 citation number를 같은 block에서 볼 수 있게 한다.

Workspace chatbot retrieval은 permission-safe readable active document ids만 사용한다. 현재 implementation은 vector search 전에 conversation-aware query와 readable documents의 title/path/body keyword overlap을 사용해 lexically relevant missing/stale documents만 최대 8개 refresh한다. Query가 selected-document referential prompt이면 readable selected document도 refresh 후보에 포함한다. 이 targeted backfill은 기존 workspace에 `DocumentChunk` rows가 거의 없어서 Welcome 같은 단일 chunk만 검색되는 상태를 완화하되, 모든 workspace document를 매 질문마다 색인하지 않는다. 이후 최근 thread messages와 현재 user message를 합친 conversation-aware query embedding으로 current `DocumentChunk` rows를 검색하고, readable selected document id가 있으면 selected-document-only search 결과를 병합한다. 이렇게 global retrieval limit 밖의 open-document chunks도 후보로 보존하되, selected chunks가 top result와 충분히 가까울 때만 prompt cap 전에 stable하게 우선 배치한다. 그 뒤 prompt 후보를 최대 12개, 문서당 최대 3개로 제한해 한 문서가 sources를 과점하지 않게 한다. Readable하지 않은 selected document id는 Langfuse metadata와 retrieval priority에 반영하지 않는다.

Legacy graph-aware scope expansion helper는 selected current document를 우선하고, saved markdown wiki links와 persisted outgoing links를 합친 linked documents, persisted backlinks, shared normalized tags, workspace fallback 순서로 중복 없이 채운다. 이 helper는 Issue #104 direct Ask default path에서는 호출하지 않고, future explicit expanded-scope Ask AI나 retrieval tuning의 근거로 남아 있다.

Legacy reranking score는 다음 공식이다.

```text
(1 - cosine distance) + scope boost + bounded keyword overlap boost
```

Current document boost는 `0.5`, linked document `0.3`, backlink `0.25`, same-tag `0.15`다. Keyword boost는 unique term당 `0.05`, maximum `0.2`다. Token overlap은 punctuation-normalized Unicode terms를 사용하고, English stop words와 too-short Latin terms는 제외하지만 Korean/CJK 2글자 terms는 후보로 유지한다.

## Issue #104 Split

Issue #104는 기존 RAG/vector DB를 제거하지 않고 AI surface별 request profile을 분리한다. 구현 범위는 `lib/rag/document-context.ts`의 현재 문서 context packer, `components/ai/thinking-indicator.tsx`의 공통 elapsed-time indicator, `AiChatThread`/`AiChatMessage` schema, Ask AI direct-context service, workspace chatbot RAG service, authenticated chatbot API routes, 우측 하단 workspace chatbot UI다.

Ask AI service는 기본 path에서 selected document re-indexing, question embedding, vector search, workspace fallback retrieval을 호출하지 않는다. 대신 현재 저장 markdown이 context budget 안에 들어가면 전체 문서를 prompt에 직접 넣고, 너무 긴 문서는 heading-aware section packer 또는 no-heading paragraph chunk fallback으로 관련 섹션을 선택한다. Ask AI citation은 현재 문서 section만 후보로 만들되, answer text가 실제로 참조한 `[n]` section만 UI에 반환한다.

새 workspace chatbot은 우측 하단 sticky AI launcher와 compact chat panel을 제공하는 별도 surface다. UI는 active thread history를 load하고, message send와 conversation reset을 지원하며, selected document id를 message request metadata로 넘긴다. Client는 workspace change, delayed thread load, delayed send response, pending reset race를 generation/version guard와 disabled controls로 방어한다. Backend service는 사용자+workspace별 active `AiChatThread`와 `AiChatMessage` history를 저장하고, PostgreSQL partial unique index가 `(workspaceId, userId)`별 `ACTIVE` thread를 하나로 제한한다. Service layer는 concurrent create race를 이 DB invariant에 맞춰 처리하고, answer generation 중 reset이 thread를 archive한 경우 stale assistant response를 저장하지 않는다. Chatbot answer turn retrieval은 질문과 readable documents의 lexical overlap으로 missing/stale chunks를 targeted refresh한 뒤 기존 `DocumentChunk` rows에서 readable active document chunks를 검색하고, follow-up 질문의 지시어가 이전 대화 주제를 잃지 않도록 conversation-aware query를 embedding한다. Readable selected document chunks는 vector distance가 top result와 충분히 가까울 때만 prompt cap 전에 우선 배치하고, returned citations는 answer가 실제로 참조한 citation marker로 필터링한다.

Ask AI와 chatbot은 model config, browser/workspace chat model override validation, answer-chain invocation, Langfuse metadata, permission-safe document loading, thinking indicator UI를 공유할 수 있지만, 하나의 overloaded service function으로 합치지 않는다. 공통 Thinking indicator는 영어 elapsed-time 메시지 `Thinking...`, `Reviewing the relevant document context...`, `Organizing the evidence and drafting an answer...`, `This is taking longer than usual. Thanks for your patience...`를 순서대로 표시하고, streaming이 없는 Issue #104 MVP에서는 full response가 도착할 때까지 유지한다. Issue #105는 non-streaming chatbot contract가 안정화된 뒤 streaming answer chain, streaming route, client stream reader, partial failure policy를 다루는 별도 follow-up이다. 설계 근거는 `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`이고, 구현 계획은 `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`에 둔다.

## Observability And Privacy

Sentry는 app/runtime error와 low-sample tracing 용도이며, RAG prompt/context body를 보내는 관측 계층이 아니다. Sentry privacy scrubber와 production 설정은 [[Production Observability Workflow]]에서 관리한다.

Langfuse는 optional/fail-open layer다. `LANGFUSE_PUBLIC_KEY`와 `LANGFUSE_SECRET_KEY`가 없거나 `MUNJIB_LANGFUSE_ENABLED=false`면 disabled다. Metadata mode는 기본값이고 LangChain callback이나 OpenTelemetry exporter를 붙이지 않는다. Full capture는 `MUNJIB_LANGFUSE_CAPTURE_MODE=full` 또는 legacy `MUNJIB_LANGFUSE_CAPTURE=full` 중 하나라도 설정된 경우에만 켜진다.

Full capture가 켜진 Node runtime에서는 `instrumentation.ts`가 `initializeLangfuseOtel()`을 호출하고, `lib/rag/langfuse-otel.ts`가 `@opentelemetry/sdk-node` `NodeSDK`와 `@langfuse/otel` `LangfuseSpanProcessor`를 시작한다. Answer generation에는 `@langfuse/langchain` callback이 연결된다. Startup failure, missing credentials, metadata mode, non-node runtime은 Ask AI request를 실패시키지 않는다.

## Failure Modes

Selected document가 actor에게 readable하지 않으면 `DOCUMENT_NOT_FOUND`로 처리한다. 빈 question은 `QUESTION_REQUIRED`다. Chat provider env가 불완전하거나 unsupported provider이면 answer generation 전에 `INVALID_CONFIG` 계열 recoverable RAG error로 이어진다. Embedding provider/dimension config 오류는 direct Ask path를 막지 않지만, `DocumentChunk` indexing과 workspace chatbot retrieval에서는 current index guard와 함께 fail-fast한다.

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
- `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`
- `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`
- `app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route.ts`
- `components/workspace-chatbot.tsx`
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
