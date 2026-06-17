# Chatbot Response Streaming Design

## Context

Issue #105 adds streaming to the Workspace AI chatbot after the Issue #104
non-streaming chatbot contract has stabilized. The current Workspace AI flow
uses `POST /api/workspaces/[workspaceSlug]/assistant/messages`, waits for
retrieval, answer generation, citation normalization, and persistence to finish,
then returns one JSON response. The client shows the shared Thinking indicator
until the full assistant message arrives.

The goal of this slice is to improve perceived latency without changing the
Ask AI current-document surface, workspace retrieval scope, model/provider
settings, citation numbering contract, or conversation persistence model.

## Goals

- Stream the Workspace AI assistant answer body as it is generated.
- Keep the existing message send request shape, including `message`,
  `selectedDocumentId`, `chatProvider`, and `chatModel`.
- Preserve route validation and stable JSON error responses before streaming
  begins.
- Persist the same final user and assistant messages that the non-streaming
  flow persists today.
- Preserve answer-referenced citation filtering and user-facing `1..n` source
  numbering.
- Keep reset/workspace-change race guards so delayed stream events cannot
  repopulate a cleared or changed conversation.

## Non-Goals

- Do not stream Ask AI responses in this slice.
- Do not stream retrieval/indexing/memory-summary phase updates.
- Do not add a multi-thread conversation UI.
- Do not change provider credentials, base URL handling, embedding identity, or
  vector index behavior.
- Do not persist partial assistant messages.
- Do not add provider-specific SDK code outside the existing LangChain model
  boundary.

## Recommended Approach

Use the existing `POST /assistant/messages` route and change the successful
answer-generation response path to newline-delimited JSON
(`application/x-ndjson`). Validation and preparation failures continue to return
ordinary JSON responses with the current HTTP status codes before the route
creates the stream response.

This keeps the browser request shape stable and avoids adding a parallel
`/stream` route. The client can read the `fetch()` response body with a
`ReadableStream` reader, parse complete JSON lines, append token content to a
placeholder assistant bubble, then finalize that bubble when the `done` event
arrives.

## Event Contract

Every streaming event is one JSON object followed by `\n`.

```json
{"type":"start"}
{"type":"token","content":"partial text"}
{"type":"done","assistantMessage":{...},"citations":[...]}
{"type":"error","error":"AI_UNAVAILABLE"}
```

Event behavior:

- `start` is emitted after validation, retrieval, prompt construction, and
  model stream setup succeed, just before answer chunks are sent.
- `token.content` is raw assistant text from the model stream. The client
  appends tokens in arrival order.
- `done.assistantMessage.content` is the normalized final answer after citation
  filtering and renumbering.
- `done.citations` uses the same citation payload and document-link behavior as
  the existing non-streaming response.
- `error.error` exposes only stable user-facing error codes.

Failures before the route creates the stream response still return existing JSON
error responses such as `INVALID_JSON`, `MESSAGE_REQUIRED`,
`INVALID_CHAT_MODEL`, `WORKSPACE_NOT_FOUND`, or `AI_UNAVAILABLE`.

## Backend Design

Add a streaming answer-chain seam alongside the existing `invokeAnswerChain()`.
The new helper builds the same `ChatPromptValue`, calls `chatModel.stream()`,
parses each streamed chunk to text, emits token text through an async callback or
async iterator, accumulates the full answer, trims the final result, and maps
provider failures or empty output to `RAG_ERROR_CODES.CHAT_REQUEST_FAILED`.

Add a Workspace AI preparation helper and streaming service entrypoint, for
example `prepareWorkspaceChatMessageStream()` plus
`sendPreparedWorkspaceChatMessageStream()`. They should reuse the current
`sendWorkspaceChatMessage()` preparation logic as much as possible:

- load workspace and active thread
- resolve provider/model config
- enforce current embedding index
- build or refresh conversation memory
- run targeted index backfill
- embed the memory-aware query
- retrieve and cap prompt chunks
- build the prompt and Langfuse metadata

Only the final answer generation step differs. The preparation helper should be
awaited before the route returns a stream response, so retrieval/indexing/memory
failures can still use the existing JSON error mapping. After preparation
succeeds, the streaming service streams model text, then normalizes citations
and persists the successful turn in the same transaction shape used today. If
the thread is archived before persistence, the service reports
`THREAD_ARCHIVED` and does not save a stale assistant response.

The existing non-streaming service can either remain for tests/fallbacks or be
implemented as a small wrapper around the streaming preparation plus final
answer accumulator. The implementation plan should prefer extracting shared
preparation/finalization helpers so the streaming path does not duplicate the
large retrieval body.

## Route Design

The message route keeps the current validation code. After validation succeeds,
it awaits Workspace AI preparation. If preparation fails, the route returns the
existing JSON error response. After preparation succeeds, it returns a
`ReadableStream` with headers:

```text
Content-Type: application/x-ndjson; charset=utf-8
Cache-Control: no-cache, no-transform
```

The route writes `start`, forwards token events, and writes `done` after
persistence. If answer generation fails after the stream has started, it writes
an `error` event and closes the stream. If validation or preparation fails
before the stream is created, it returns the existing JSON response and status
code.

The route should pass the request abort signal into the LangChain invocation
config where supported, so client-side aborts can stop provider work.

## Client Design

`WorkspaceChatbot` keeps the optimistic user-message append. On send, it also
adds an assistant placeholder bubble with empty content and no citations.

While the request is in progress:

- Before the first `token`, show the existing Thinking indicator.
- On the first `token`, hide the Thinking indicator and render the assistant
  placeholder.
- Append each token to the placeholder content.
- On `done`, replace the placeholder id/content/citations with the persisted
  assistant message and final citations.

On stream `error`, remove the partial assistant placeholder and show the existing
generic error state. The user message should not remain as an orphan visible
turn if the backend did not persist the turn. Existing generation/version guards
continue to ignore late stream events after reset or workspace changes. Each
send should own an `AbortController`, and reset/workspace-change should abort
the active stream.

## Error, Cancel, And Reset Policy

- Validation, auth, retrieval, indexing, memory, and prompt-preparation errors
  before streaming keep current JSON responses.
- Provider or answer-chain failures after streaming begins produce an
  `error` event with `AI_UNAVAILABLE`.
- Empty final answer is treated as a provider failure.
- Partial assistant content is not persisted and is removed from the UI on
  stream error.
- Reset archives the active thread as it does today, increments the client
  generation guard, aborts the active stream, clears visible messages, and
  ignores any late token or done events.
- If reset wins before persistence, the backend uses the existing active-thread
  guard and reports `THREAD_ARCHIVED`.

## Observability And Privacy

Langfuse metadata behavior remains unchanged. Metadata mode still avoids
prompt/context/question/answer body egress through callbacks. Full capture can
receive normal LangChain callback events if configured, but the NDJSON stream
itself should not add new external telemetry body capture.

Server logs may include provider errors through existing RAG error mapping, but
must not log streamed answer text by default.

## Tests

Targeted coverage should include:

- `tests/rag/answer-chain.test.ts`: streaming helper emits chunks in order,
  returns the accumulated final answer, maps provider failures, and rejects empty
  output.
- `tests/rag/workspace-chat.test.ts`: streaming Workspace AI emits tokens and
  persists one user plus one normalized assistant message only after successful
  completion.
- `tests/rag/workspace-chat-route.test.ts`: valid requests return NDJSON
  `start`, `token`, and `done`; validation failures keep JSON responses.
- `tests/components/workspace-chatbot.test.tsx`: client appends streamed tokens
  into a placeholder assistant bubble, renders citations on `done`, removes
  partial content on stream error, and ignores late stream events after reset.
- Existing non-streaming Ask AI tests remain unchanged.

Useful verification commands:

```bash
pnpm exec vitest run tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

## Open Decisions For Implementation

- Whether to keep `sendWorkspaceChatMessage()` as a separate non-streaming
  service for tests/backward compatibility, or turn it into a wrapper around the
  streaming final answer accumulator.
- Whether the assistant placeholder should be visible immediately with empty
  content or only after the first token. The preferred UX is to show Thinking
  first, then reveal the assistant bubble when text starts.
