# AI Assistant Accuracy And Workspace Chatbot Design

## Context

Issue #104 improves Munjib's AI experience in two related but distinct areas.
The current Ask AI implementation uses the saved-content-only RAG path for
document questions. It stores document chunks in pgvector through the existing
`DocumentChunk` table, refreshes the selected document index during the ask
request, embeds the question, expands retrieval scope across current document,
links, backlinks, tags, and fallback documents, then asks the chat model to
answer from the retrieved chunks.

That design is useful for cross-document retrieval, but it is a poor default
for "answer from the current document" questions. The observed failures match
that mismatch: current-document facts can be missed, unrelated documents can
appear as citations, and request latency can exceed several minutes because the
request path may re-embed document chunks before answer generation.

This design separates the AI surfaces by intent:

- Ask AI remains an editor-local current document assistant.
- The new floating chatbot becomes a workspace assistant with persisted
  conversation history and workspace-wide retrieval.

The existing vector database is not removed. It remains the backbone for
workspace chatbot retrieval and for future Ask AI expanded-scope fallback.

## Decisions From Brainstorming

- Keep the existing Ask AI UI inside the document editor.
- Change Ask AI's default behavior to current-document-only direct context
  instead of vector retrieval.
- Use retrieval for Ask AI only when the current document is too large for the
  context budget. Workspace or linked-document scope is deferred to a separate
  explicit scope-control feature.
- Add a right-bottom sticky AI launcher for a workspace chatbot.
- Store chatbot history per user and workspace.
- Reuse existing RAG/vector infrastructure for chatbot workspace retrieval.
- Add conversation storage models for chatbot threads and messages.
- Keep chat model selection behavior from Issue #102: client may send only a
  chat model id override, while provider credentials and base URLs stay
  server-side.
- Use English UI copy for AI loading and elapsed-time thinking messages.

## Goals

- Improve Ask AI accuracy for current-document questions.
- Remove default Ask AI per-request document re-indexing and question vector
  search.
- Prevent unrelated document citations in the default Ask AI path.
- Add a workspace chatbot that can continue conversation context across turns.
- Persist chatbot messages so a user can resume a workspace conversation.
- Reuse permission filtering, model configuration, answer-chain invocation,
  Langfuse metadata, and existing vector search where appropriate.
- Add a shared thinking indicator pattern for Ask AI and chatbot requests.
- Add regression tests for accuracy, scope, persistence, permissions, and UI
  loading behavior.

## Non-Goals

- Do not remove the existing `DocumentChunk` pgvector store.
- Do not migrate embedding dimensions or change the current embedding index
  identity in this slice.
- Do not add provider switching, API key editing, or base URL editing in the
  browser.
- Do not make Ask AI automatically search the whole workspace by default.
- Do not build a multi-thread conversation browser in the MVP.
- Do not add organization-wide AI policy management in this slice.
- Do not implement a full RAG evaluation dashboard in this slice.

## Architecture

The AI layer splits into two request profiles.

Ask AI uses a document-first profile. The route remains:

```text
POST /api/workspaces/[workspaceSlug]/documents/[documentId]/ask
```

The service still authenticates the actor, checks workspace membership, enforces
document read permission, applies the optional chat model override, and invokes
the model through the existing answer-chain utilities. The evidence gathering
step changes from retrieval-first to direct context-first.

The workspace chatbot uses a workspace-retrieval profile. New routes live under
the workspace assistant namespace:

```text
GET  /api/workspaces/[workspaceSlug]/assistant/thread
POST /api/workspaces/[workspaceSlug]/assistant/messages
POST /api/workspaces/[workspaceSlug]/assistant/thread/reset
```

The chatbot loads or creates the active user/workspace thread, saves the user
message, retrieves readable workspace chunks through the existing vector store,
combines recent thread history with retrieved context, saves the assistant
response, and returns the new messages plus citations.

Shared utilities should stay small and explicit:

- model config and chat model creation
- chat model override validation
- permission-safe readable document loading
- context budget estimation
- answer-chain invocation
- Langfuse metadata construction
- citation formatting types
- thinking indicator UI behavior

Ask AI and chatbot should not share one overloaded service function. They need
different defaults, different citation expectations, and different performance
tradeoffs.

## Ask AI Direct Context Flow

Ask AI answers from the current saved document by default.

1. Trim and validate the question.
2. Load the workspace, actor membership, selected active document, and explicit
   document permissions.
3. Reject unreadable selected documents as `DOCUMENT_NOT_FOUND`.
4. Load the env-based model config and apply the optional chat model override to
   `chat.model` only.
5. Build a current-document context package from the selected saved markdown.
6. Invoke the answer chain with the current-document context.
7. Return the answer and current-document section citations.

The default path must not call:

- `safeIndexSavedDocument()`
- `embedText(question)`
- `searchSimilarChunks()`
- fallback workspace retrieval

For documents that fit the configured context budget, Ask AI should include the
full saved markdown body. For oversized documents, it should use a
heading-aware document packer:

- split markdown by headings and structural blocks
- estimate tokens with the existing chunk/token approach where possible
- score sections using query term overlap, heading match, and local section
  structure
- preserve heading paths for citations
- include the highest-value sections within budget
- record metadata indicating that the answer used a partial document context

Ask AI citations should point only to sections of the current document in this
MVP. Returning every prompt section as a source is acceptable only if all
sections came from the current document; the preferred behavior is to return the
sections that the answer cites or the smallest set of sections used as evidence.

## Workspace Chatbot RAG Flow

The chatbot is workspace-wide and multi-turn.

1. Load or create the active `AiChatThread` for the current user and workspace.
2. Save the user message.
3. Load recent thread messages for conversational context.
4. Embed the current user question.
5. Search existing `DocumentChunk` rows across readable workspace documents.
6. Apply chatbot reranking and quality limits.
7. Build a prompt from recent messages and retrieved document chunks.
8. Invoke the answer chain.
9. Save the assistant message with citations and model metadata.
10. Return the new assistant message and updated thread state.

The chatbot should reuse the current vector store rather than inventing a new
embedding storage path. The first implementation should keep the current
embedding model/index contract and use existing `DocumentChunk` rows.

Retrieval tuning differs from the current Ask AI behavior:

- use readable active documents only
- cap chunks per document to reduce source flooding
- apply a minimum relevance threshold once vector distance values are calibrated
  against the existing seeded fixtures
- prefer high-similarity chunks over broad graph expansion
- boost the currently selected document only when the client sends a readable
  selected document id as request metadata
- return citations only for chunks included in the final answer context

If no relevant chunks are found, the chatbot should answer that it could not
find enough evidence in the workspace documents. It should not invent an answer
from outside knowledge.

## Data Model

The existing vector data model remains:

```text
DocumentChunk
  workspaceId
  documentId
  chunkIndex
  headingPath
  content
  contentHash
  sourceUpdatedAt
  tokenCount
  embeddingModel
  embedding vector(1024)
```

Add conversation storage for the workspace chatbot:

```text
AiChatThread
  id
  workspaceId
  userId
  title
  status
  lastMessageAt
  createdAt
  updatedAt

AiChatMessage
  id
  threadId
  role
  content
  citationsJson
  model
  createdAt
```

Thread `status` uses `ACTIVE` and `ARCHIVED`. Message `role` uses `USER` and
`ASSISTANT`. `citationsJson` stores the assistant message citation payload as
JSON. User messages use an empty citation payload.

Suggested relations:

- `Workspace.aiChatThreads`
- `User.aiChatThreads`
- `AiChatThread.messages`

Suggested constraints and indexes:

- index `AiChatThread(workspaceId, userId, status, lastMessageAt)`
- index `AiChatMessage(threadId, createdAt)`
- cascade messages when a thread is deleted
- cascade threads when a workspace or user is deleted

MVP behavior uses one active thread per user/workspace. The schema uses a thread
model instead of a single settings row so future work can add thread lists,
renaming, archiving, and multiple topic conversations without changing the core
message model.

Reset behavior archives the current active thread and clears the visible
conversation. The next thread load or message send creates a fresh active
thread for that user/workspace.

## UI

Ask AI stays in the editor-side assistant panel. Its copy should emphasize the
current saved document rather than workspace-wide search. The panel continues to
show the effective chat model. If the document has unsaved changes, the saved
content warning remains.

Add a workspace chatbot launcher near the bottom-right of the workspace page.
The closed state is an icon-only AI button with an accessible label. The open
state is a compact fixed panel with:

- header with workspace assistant label
- close control
- reset conversation control
- scrollable message list
- assistant/user message bubbles
- citation previews under assistant messages
- composer input
- submit button
- thinking indicator area

The chatbot is independent from the selected document, but it may receive the
currently selected document id as optional metadata for future boosting.

The floating UI should not block core document editing controls on desktop or
mobile. The panel should use stable dimensions and responsive constraints so
loading messages and long model/citation text do not resize the page or overlap
document content.

## Thinking Indicator

Ask AI and chatbot share the same elapsed-time thinking indicator behavior.
Messages are English-only.

Default message schedule:

| Elapsed time | Message |
| --- | --- |
| 0-10 seconds | `Thinking...` |
| 10-30 seconds | `Reviewing the relevant document context...` |
| 30-60 seconds | `Organizing the evidence and drafting an answer...` |
| 60+ seconds | `This is taking longer than usual. Thanks for your patience...` |

The schedule is based on elapsed request time, not guaranteed internal progress.
It should not imply that a retrieval or answer-generation step has completed.

Behavior:

- Start the timer when the request is submitted.
- Disable duplicate submit while the request is active.
- Show the current message in the pending assistant response area.
- Use `aria-live="polite"` so screen readers receive the state change.
- Clear timers on success, failure, cancellation, unmount, and conversation
  reset.
- If streaming is implemented in the same slice, keep the indicator visible
  until the first answer token arrives, then replace it with the streaming
  assistant message.
- If streaming is deferred, keep the indicator until the full response arrives.

The shared implementation can be a small hook such as `useThinkingIndicator()`
plus a presentational component used by both AI surfaces.

## Streaming

Streaming is recommended for perceived speed, but the MVP may ship without
streaming if the service split and thinking indicator land first. The design
should avoid blocking it:

- API response shapes should leave room for streaming later.
- UI state should distinguish "thinking before first token" from "answer is
  streaming".
- saved chatbot messages should be created or finalized only once the assistant
  content is complete.

If streaming is deferred, the MVP still benefits from removing Ask AI's default
embedding and vector search work.

## Error Handling

Ask AI errors:

- blank question returns `QUESTION_REQUIRED`
- unreadable or inactive selected document returns `DOCUMENT_NOT_FOUND`
- empty current document returns a clear no-content message
- oversized documents that cannot produce a context package return a clear
  context-limit message
- provider/model failures normalize to the existing user-facing AI unavailable
  path

Chatbot errors:

- missing workspace or membership returns the existing workspace not found
  behavior
- empty message returns a stable validation error
- missing or empty vector index returns a grounded no-evidence answer, not a
  crash
- provider/model failures show a retryable AI unavailable message
- failed assistant response should not lose the already saved user message

Both surfaces should log enough server detail for debugging without exposing
provider errors, credentials, raw prompts, or raw retrieved context in the
browser.

## Observability And Privacy

Langfuse remains optional and fail-open. Metadata mode should continue to avoid
raw prompt, context, question, answer, and document body egress by default.

Useful metadata for both surfaces:

- operation name: `rag.ask_document` or `rag.workspace_chat`
- workspace id and slug
- selected document id for Ask AI
- thread id for chatbot
- effective chat provider and model
- embedding provider/model for chatbot retrieval
- retrieved chunk count for chatbot
- citation document ids
- elapsed request duration bucket

Full capture remains an explicit environment opt-in.

## Testing

Ask AI tests:

- current-document facts are included in the prompt without vector search
- default Ask AI does not call selected document re-indexing
- default Ask AI does not embed the question
- default Ask AI does not search unrelated readable documents
- current-document section citations are returned
- oversized document packing selects relevant heading sections
- optional chat model override still changes only `chat.model`

Chatbot service tests:

- creates or reuses one active thread per user/workspace
- saves user and assistant messages in order
- includes recent thread history in the answer prompt
- searches only readable active documents
- caps or filters retrieved chunks before prompt construction
- stores citations and model metadata on assistant messages
- returns no-evidence behavior when the vector index has no relevant context

Route tests:

- Ask AI route preserves validation and normalized errors
- chatbot thread route loads or creates the current thread
- chatbot message route validates input and persists messages
- reset route archives the active thread and leaves the next request to create a
  fresh active thread

UI tests:

- Ask AI shows the thinking indicator schedule while waiting
- chatbot launcher opens and closes the panel
- chatbot sends a message and renders the assistant response
- chatbot reloads prior messages for the workspace thread
- reset clears the visible conversation
- failure states remove the thinking indicator and show retryable copy

Wiki and project verification should include the existing RAG tests, new
chatbot tests, TypeScript, and wiki sync commands before committing
implementation work.

## Rollout Notes

Implementation should happen in small slices:

1. Extract Ask AI direct-context service and tests.
2. Add shared thinking indicator UI behavior.
3. Add chatbot Prisma models and migration.
4. Add chatbot service and API routes.
5. Add floating chatbot UI.
6. Update wiki pages and verification coverage.

The first implementation should favor correctness and clear boundaries over
aggressive retrieval expansion. Once the two profiles are stable, future work
can add scope controls, streaming, multiple chat threads, and evaluation
fixtures.
