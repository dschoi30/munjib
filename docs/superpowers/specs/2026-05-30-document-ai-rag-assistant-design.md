# Document AI RAG Assistant Design

## Context

Issue #73 adds a document-centered AI assistant to Munjib. The entry point is an
`AI에게 묻기` button placed to the right of the document title input in
`DocumentEditor`. The assistant answers questions from saved workspace document
content, not from unsaved editor draft state.

Munjib already has the important retrieval signals for this feature:

- readable workspace document filtering in `app/workspaces/[workspaceSlug]/page.tsx`
- persisted frontmatter wiki link rows in `DocumentLink`
- full-markdown wiki link parsing and target resolution for graph view
- frontmatter and body tag extraction through document metadata parsing
- PostgreSQL as the existing durable data store

The design should reuse those contracts instead of introducing a separate search
service in the first implementation.

## Goals

- Add an `AI에게 묻기` affordance beside the `name="title"` input.
- Let users ask questions about the currently selected saved document.
- Retrieve context from the current document, linked documents, backlink source
  documents, same-tag documents, and limited workspace fallback results.
- Use Ollama `gemma4:e4b` as the default chat model.
- Use Ollama `bge-m3` as the default embedding model.
- Store and search embeddings in PostgreSQL with pgvector.
- Keep model names configurable for later model swaps.
- Return answers with source citations pointing back to document titles and
  heading paths.

## Non-Goals

- Do not include unsaved `title` or `contentMarkdown` draft state in the ask
  request.
- Do not auto-save before asking.
- Do not implement multi-turn durable chat history in the first slice.
- Do not add an external vector database.
- Do not change the existing `DocumentLink` meaning for Properties Links or
  backlinks.
- Do not let unreadable documents enter retrieval context.

## UX

`DocumentEditor` should render the title row as a flex layout:

- the existing title input keeps the large, borderless heading treatment
- a compact `AI에게 묻기` button sits to its right
- the button is available only when a document is selected

Clicking the button opens an assistant panel near the top of the editor surface.
The panel contains:

- a question textarea
- a submit button
- loading and error states
- the latest answer
- citation links grouped by source document

The assistant uses saved document state only. If the user has unsaved editor
changes, the UI may show a small status note that unsaved edits are excluded, but
the request payload must still contain only the question and selected document id.

The first implementation can keep only the latest answer in component state. It
does not need persistent chat sessions or conversation threading.

## Architecture

Use the existing Next.js monolith. Add focused RAG modules under `lib/rag/`:

- `ollama.ts`: Ollama chat and embedding client wrappers
- `chunk-markdown.ts`: Markdown-aware chunk builder
- `index-document.ts`: saved document to chunk/embedding index pipeline
- `retriever.ts`: graph-aware retrieval and reranking
- `prompt.ts`: answer prompt construction and citation formatting
- `vector-store.ts`: pgvector raw SQL reads/writes

Add a route handler for ask requests rather than a server action:

`app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`

The route handler should:

1. require the current user
2. load the selected document by id and workspace slug
3. enforce the same read permission policy used by the workspace page
4. read the saved `Document.title` and `Document.contentMarkdown`
5. retrieve relevant chunks
6. call Ollama chat
7. return answer text and citation metadata

The request body should contain only the user question. It should not include
editor draft title or markdown.

## Ollama Configuration

Default environment variables:

```text
MUNJIB_OLLAMA_BASE_URL=http://localhost:11434
MUNJIB_RAG_CHAT_MODEL=gemma4:e4b
MUNJIB_RAG_EMBED_MODEL=bge-m3
```

`gemma4:e4b` is the first chat model, but the code should treat it as a
configuration value rather than a hard-coded business rule. `bge-m3` should also
be configurable, but changing it requires rebuilding embeddings because the
stored vector dimension and semantic space are model-specific. `bge-m3` produces
1024-dimensional dense embeddings for this design. If a later embedding model
uses a different dimension, the `DocumentChunk.embedding` column and pgvector
index must be migrated before the model is enabled.

Ollama failures should surface as assistant errors without breaking document
editing. The editor should remain usable if Ollama is offline.

## pgvector Data Model

Switch local Docker PostgreSQL from `postgres:16-alpine` to a pgvector-enabled
Postgres 16 image, such as `pgvector/pgvector:0.8.2-pg16`, and add a migration
that enables the extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Add a chunk index table. Prisma can model the vector column as unsupported while
raw SQL handles writes and similarity search:

```prisma
model DocumentChunk {
  id             String   @id @default(cuid())
  workspaceId    String
  documentId     String
  chunkIndex     Int
  headingPath    String?
  content        String
  contentHash    String
  sourceUpdatedAt DateTime
  tokenCount     Int
  embeddingModel String
  embedding      Unsupported("vector(1024)")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  document       Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, embeddingModel, chunkIndex])
  @@index([workspaceId, embeddingModel])
  @@index([documentId])
}
```

`workspaceId` is denormalized intentionally so retrieval can filter by workspace
before vector ranking. `contentHash` lets the indexer skip unchanged chunks.
`sourceUpdatedAt` records the saved document timestamp used to build the chunk,
so retrieval can exclude stale chunks after a document save if reindexing fails.

Add a raw SQL HNSW index for cosine distance:

```sql
CREATE INDEX "DocumentChunk_embedding_hnsw_idx"
ON "DocumentChunk"
USING hnsw (embedding vector_cosine_ops);
```

Keep pgvector operations behind `lib/rag/vector-store.ts` because Prisma Client
does not natively support vector values. Raw SQL must use static SQL strings
with positional parameters for all user/document/vector values. Cast vector
parameters with `CAST($n AS vector(1024))` instead of interpolating vector text
into SQL.

## Chunking Strategy

Build chunks from saved markdown with heading awareness:

- strip YAML frontmatter from body text for chunk content
- keep frontmatter-derived tags as metadata signal, not chunk body text
- split by ATX heading hierarchy first
- keep paragraph, list, table, and fenced code block boundaries when possible
- target 800-1200 tokens per chunk
- use 100-150 token overlap when a long section must be split
- store `headingPath` such as `Root > Security > Rotation`
- include title and path in retriever metadata, not repeatedly inside every
  chunk content unless needed for the prompt

Small documents can produce a single chunk. Very short chunks should be merged
with adjacent chunks from the same section when it improves context quality.

## Indexing Lifecycle

Rebuild chunks for a document after saved content changes:

- document create
- document update
- version restore
- markdown import
- attachment upload that appends markdown

The first implementation can rebuild the selected document synchronously in the
same server path after the document mutation completes. If Ollama embedding is
offline, save should still succeed. Old chunks may remain in the table, but they
must carry the previous `sourceUpdatedAt` value and be excluded from retrieval
for the changed document. A later worker can make indexing asynchronous.

Ask requests should verify that the selected document has current chunks. If
chunks are missing, the ask route may perform a best-effort synchronous index of
that saved document before retrieval. Workspace-wide backfill can be a script or
admin-only route in a later slice.

## Retriever

Use the approved current-document-centered extended search strategy.

Candidate scopes:

1. current document chunks
2. outgoing wiki link target documents from saved markdown/frontmatter
3. backlink source documents from persisted `DocumentLink` rows
4. same-tag documents from saved metadata parsing
5. workspace fallback chunks from all readable documents

Only readable active documents are eligible. Retrieval should reuse the same
folder-aware and underscore-aware wiki link resolution helpers used by graph
construction.

Scoring should combine:

- cosine similarity from pgvector
- graph distance boost
- current document boost
- same tag boost
- lightweight keyword overlap
- MMR-style diversity so one long document does not consume all context slots

Initial weighted score formula:

```text
score = (1 - cosine_distance)
  + current_document_boost
  + graph_scope_boost
  + keyword_overlap_boost
```

Boost defaults:

- current document: `0.50`
- outgoing wiki link target: `0.30`
- backlink source: `0.25`
- same-tag document: `0.15`
- keyword overlap: `min(0.20, matching_query_terms * 0.05)`

Keep these as named constants in the retriever so tuning is visible and covered
by tests.

Initial context budget:

- retrieve 40-60 candidates from vector search
- rerank to 12-20 chunks
- always allow a small number of current-document chunks through even if vector
  rank is weak

The answer prompt should include source metadata with each chunk and require the
model to answer only from provided context. If context is insufficient, the model
should say it cannot find enough saved document evidence.

## Error Handling

- No selected document: button should not open a usable ask form.
- No read permission: route returns 404 or permission-safe error.
- Empty question: client blocks submit and route validates.
- Missing/stale chunks: route tries best-effort saved-document indexing.
- Ollama offline: return a recoverable assistant error.
- Embedding dimension mismatch: fail indexing for that model and report a
  configuration error in logs.
- No retrieved context: answer should explain that no relevant saved document
  context was found.

## Testing

Add pure unit coverage for:

- Markdown heading-aware chunking
- long-section splitting and overlap
- frontmatter stripping
- retriever graph scope construction
- scoring/reranking order with current document, wiki links, backlinks, tags,
  and workspace fallback

Add service/route coverage for:

- ask route reads saved DB content and ignores any draft-like payload fields
- unreadable documents are excluded from retrieval
- selected document read permission is enforced
- missing chunks trigger best-effort indexing
- Ollama errors return recoverable UI errors

Add component coverage for:

- `AI에게 묻기` button appears to the right of the title input
- clicking opens the assistant panel
- submitting sends the question to the ask route
- loading, answer, citation, and error states render
- unsaved editor changes are not sent in the request body

Run targeted verification plus existing editor/wiki checks:

```bash
pnpm exec vitest run tests/rag tests/components/document-editor-preview.test.tsx tests/documents/service.test.ts tests/wiki-links/reconcile.test.ts tests/knowledge-graph/model.test.ts
pnpm exec tsc --noEmit
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

## Wiki Updates

When implemented, update:

- `wiki/Document Knowledge Model.md`: `DocumentChunk`, pgvector, embedding index
- `wiki/Document Editing Workflow.md`: `AI에게 묻기` saved-content-only ask flow
- `wiki/Next.js Prisma Monolith.md`: pgvector remains inside the monolith for
  the first RAG implementation
- `wiki/Project PRD.md`: Issue #73 planned AI assistant scope
- `wiki/index.md` and `wiki/log.md`: status board and chronology

## Implementation Decisions

- Stale chunks are not trusted. Retrieval must require chunk `sourceUpdatedAt`
  to match the current saved document `updatedAt`.
- The first slice returns a complete answer response. The route handler boundary
  leaves room for streaming later.
- Workspace-wide backfill starts as a script or maintenance command, not an
  admin UI.
